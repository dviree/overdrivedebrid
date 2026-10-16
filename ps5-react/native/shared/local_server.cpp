// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "local_server.hpp"
#include "thread_name.hpp"
#include "worker_thread.hpp"
#include <arpa/inet.h>
#include <algorithm>
#include <atomic>
#include <cerrno>
#include <chrono>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <deque>
#include <map>
#include <mutex>
#include <netinet/in.h>
#include <optional>
#include <poll.h>
#include <set>
#include <sys/time.h>
#include <sys/socket.h>
#include <unistd.h>

namespace local_server {
namespace {
using Clock = std::chrono::steady_clock;

struct Answer {
  int status = 200;
  std::string content_type, body;
};

std::mutex mutex;
std::deque<Request> pending;                    // read, not yet polled
std::map<std::uint32_t, Answer> answers;        // given by respond(), not yet sent
std::set<std::uint32_t> waiting;                // requests whose connection waits for an answer
std::uint32_t next_id = 1;
std::atomic<bool> stopping{false};
std::atomic<std::uint16_t> listening_port{0};
int listen_fd = -1;
WorkerThread worker;

const char* reason(int status) {
  switch (status) {
  case 200: return "OK";
  case 201: return "Created";
  case 204: return "No Content";
  case 301: return "Moved Permanently";
  case 302: return "Found";
  case 303: return "See Other";
  case 304: return "Not Modified";
  case 400: return "Bad Request";
  case 401: return "Unauthorized";
  case 403: return "Forbidden";
  case 404: return "Not Found";
  case 405: return "Method Not Allowed";
  case 409: return "Conflict";
  case 413: return "Payload Too Large";
  case 422: return "Unprocessable Content";
  case 500: return "Internal Server Error";
  case 503: return "Service Unavailable";
  case 504: return "Gateway Timeout";
  default: return "Status";
  }
}

bool send_all(int fd, const char* data, std::size_t size) {
#ifdef MSG_NOSIGNAL
  constexpr int kFlags = MSG_NOSIGNAL;
#else
  constexpr int kFlags = 0;
#endif
  while (size) {
    const ssize_t sent = ::send(fd, data, size, kFlags);
    if (sent < 0 && errno == EINTR) continue;
    if (sent <= 0) return false;
    data += sent;
    size -= static_cast<std::size_t>(sent);
  }
  return true;
}

void write_response(int fd, int status, const std::string& content_type, const std::string& body) {
  char head[512];
  const int length = std::snprintf(head, sizeof head,
                                   "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\n"
                                   "Cache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\nConnection: close\r\n\r\n",
                                   status, reason(status), content_type.empty() ? "text/plain; charset=utf-8" : content_type.c_str(),
                                   body.size());
  if (length <= 0 || static_cast<std::size_t>(length) >= sizeof head) return;
  if (send_all(fd, head, static_cast<std::size_t>(length))) send_all(fd, body.data(), body.size());
}

std::string lower(std::string text) {
  for (char& c : text) c = static_cast<char>(c >= 'A' && c <= 'Z' ? c + 32 : c);
  return text;
}

struct Connection {
  int fd = -1;
  std::string peer, buffer;
  std::uint32_t id = 0; // the request it waits on once read
  Clock::time_point deadline;
};

enum class Parsed { more, done, refused };

// Parses a complete request out of `buffer`; answers a malformed or oversized one itself.
Parsed parse(Connection& connection, Request& request) {
  const std::string& buffer = connection.buffer;
  const auto end = buffer.find("\r\n\r\n");
  if (end == std::string::npos) {
    if (buffer.size() < kMaxHeaderBytes) return Parsed::more;
    write_response(connection.fd, 413, "", "Request headers are too large.\n");
    return Parsed::refused;
  }
  const std::string head = buffer.substr(0, end);
  const auto line_end = head.find("\r\n");
  const std::string line = head.substr(0, line_end);
  const auto first = line.find(' ');
  const auto second = first == std::string::npos ? std::string::npos : line.find(' ', first + 1);
  if (second == std::string::npos || line.compare(second + 1, 5, "HTTP/") != 0) {
    write_response(connection.fd, 400, "", "Malformed request line.\n");
    return Parsed::refused;
  }
  request.method = line.substr(0, first);
  request.path = line.substr(first + 1, second - first - 1);
  request.address = connection.peer;
  if (request.path.empty() || request.path[0] != '/') {
    write_response(connection.fd, 400, "", "Only origin-form request targets are served.\n");
    return Parsed::refused;
  }
  std::size_t content_length = 0;
  std::size_t at = line_end == std::string::npos ? head.size() : line_end + 2;
  while (at < head.size()) {
    auto next = head.find("\r\n", at);
    if (next == std::string::npos) next = head.size();
    const std::string field = head.substr(at, next - at);
    at = next + 2;
    const auto colon = field.find(':');
    if (colon == std::string::npos) continue;
    const std::string name = lower(field.substr(0, colon));
    std::string value = field.substr(colon + 1);
    while (!value.empty() && (value.front() == ' ' || value.front() == '\t')) value.erase(0, 1);
    while (!value.empty() && (value.back() == ' ' || value.back() == '\t')) value.pop_back();
    if (name == "content-length") {
      char* stop = nullptr;
      const unsigned long long parsed = std::strtoull(value.c_str(), &stop, 10);
      if (value.empty() || *stop || parsed > kMaxBodyBytes) {
        write_response(connection.fd, 413, "", "Request body is too large.\n");
        return Parsed::refused;
      }
      content_length = static_cast<std::size_t>(parsed);
    } else if (name == "content-type") {
      request.content_type = value.substr(0, 256);
    } else if (name == "transfer-encoding") {
      write_response(connection.fd, 400, "", "Chunked request bodies are not supported.\n");
      return Parsed::refused;
    }
  }
  if (buffer.size() - end - 4 < content_length) return Parsed::more;
  request.body = buffer.substr(end + 4, content_length);
  return Parsed::done;
}

void finish(Connection& connection) {
  ::shutdown(connection.fd, SHUT_WR);
  ::close(connection.fd);
  connection.fd = -1;
}

void run(int fd) {
  name_thread("local-server");
  std::vector<Connection> connections;
  std::vector<pollfd> watched;
  char chunk[4096];
  while (!stopping) {
    watched.assign(1, pollfd{fd, POLLIN, 0});
    for (const auto& connection : connections) watched.push_back({connection.fd, static_cast<short>(connection.id ? 0 : POLLIN), 0});
    // Answers arrive through respond() without waking the poll, so it is sliced short.
    const int ready = ::poll(watched.data(), static_cast<nfds_t>(watched.size()), 20);
    if (ready < 0 && errno != EINTR) break;
    const auto now = Clock::now();
    if (ready > 0 && (watched[0].revents & POLLIN) && connections.size() < kMaxConnections) {
      sockaddr_in from{};
      socklen_t size = sizeof from;
      const int client = ::accept(fd, reinterpret_cast<sockaddr*>(&from), &size);
      if (client >= 0) {
#ifdef SO_NOSIGPIPE
        const int on = 1;
        setsockopt(client, SOL_SOCKET, SO_NOSIGPIPE, &on, sizeof on);
#endif
        // A response is small and goes out at once; a peer that stops reading is dropped.
        timeval limit{2, 0};
        setsockopt(client, SOL_SOCKET, SO_SNDTIMEO, &limit, sizeof limit);
        Connection connection;
        connection.fd = client;
        char peer[INET_ADDRSTRLEN] = {};
        if (from.sin_family == AF_INET) inet_ntop(AF_INET, &from.sin_addr, peer, sizeof peer);
        connection.peer = peer;
        connection.deadline = now + std::chrono::milliseconds(kReadTimeoutMs);
        connections.push_back(std::move(connection));
      }
    }
    for (std::size_t i = 0; i < connections.size(); ++i) {
      Connection& connection = connections[i];
      const short events = i + 1 < watched.size() && watched[i + 1].fd == connection.fd ? watched[i + 1].revents : 0;
      if (!connection.id && (events & (POLLIN | POLLHUP | POLLERR))) {
        const ssize_t received = ::recv(connection.fd, chunk, sizeof chunk, 0);
        if (received <= 0 && !(received < 0 && errno == EINTR)) {
          finish(connection);
          continue;
        }
        if (received > 0) connection.buffer.append(chunk, static_cast<std::size_t>(received));
        Request request;
        const Parsed parsed = parse(connection, request);
        if (parsed == Parsed::refused) {
          finish(connection);
          continue;
        }
        if (parsed == Parsed::done) {
          std::lock_guard lock(mutex);
          request.id = connection.id = next_id++;
          if (!next_id) next_id = 1;
          waiting.insert(connection.id);
          pending.push_back(std::move(request));
          connection.buffer.clear();
          connection.deadline = now + std::chrono::milliseconds(kAnswerTimeoutMs);
        }
      }
      if (connection.id) {
        std::optional<Answer> reply;
        {
          std::lock_guard lock(mutex);
          if (const auto found = answers.find(connection.id); found != answers.end()) {
            reply = std::move(found->second);
            answers.erase(found);
          } else if (now >= connection.deadline) {
            reply = Answer{504, "", "The app did not answer.\n"};
          }
          if (reply) {
            waiting.erase(connection.id);
            // A request the app never polled is dropped with its connection.
            for (auto it = pending.begin(); it != pending.end(); ++it)
              if (it->id == connection.id) {
                pending.erase(it);
                break;
              }
          }
        }
        if (reply) {
          write_response(connection.fd, reply->status, reply->content_type, reply->body);
          finish(connection);
        }
      } else if (now >= connection.deadline) {
        // Browsers open connections ahead of need and may never use them.
        finish(connection);
      }
    }
    connections.erase(std::remove_if(connections.begin(), connections.end(), [](const Connection& c) { return c.fd < 0; }),
                      connections.end());
  }
  for (auto& connection : connections) {
    if (connection.id) write_response(connection.fd, 503, "", "Closing.\n");
    finish(connection);
  }
}
} // namespace

bool listen(std::uint16_t port, std::string& error) {
  if (listening_port == port && listen_fd >= 0) return true;
  close();
  const int fd = ::socket(AF_INET, SOCK_STREAM, 0);
  if (fd < 0) {
    error = std::string("socket: ") + std::strerror(errno);
    return false;
  }
  const int on = 1;
  setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &on, sizeof on);
  sockaddr_in at{};
  at.sin_family = AF_INET;
  at.sin_port = htons(port);
  at.sin_addr.s_addr = htonl(INADDR_ANY);
  if (::bind(fd, reinterpret_cast<const sockaddr*>(&at), sizeof at) != 0 || ::listen(fd, 8) != 0) {
    error = std::string("bind: ") + std::strerror(errno);
    ::close(fd);
    return false;
  }
  stopping = false;
  listen_fd = fd;
  if (!worker.start([fd] { run(fd); }, 256 * 1024)) {
    error = "could not start the server worker";
    ::close(fd);
    listen_fd = -1;
    return false;
  }
  listening_port = port;
  return true;
}

std::vector<Request> poll() {
  std::lock_guard lock(mutex);
  std::vector<Request> out(std::make_move_iterator(pending.begin()), std::make_move_iterator(pending.end()));
  pending.clear();
  return out;
}

bool respond(std::uint32_t id, int status, std::string content_type, std::string body) {
  std::lock_guard lock(mutex);
  if (!waiting.count(id) || answers.count(id)) return false;
  answers.emplace(id, Answer{status, std::move(content_type), std::move(body)});
  return true;
}

std::uint16_t port() {
  return listening_port;
}

std::string address() {
  // A UDP socket "connected" to a public address sends nothing, but the system picks the
  // interface (and so the address) a packet to it would leave from.
  const int fd = ::socket(AF_INET, SOCK_DGRAM, 0);
  if (fd < 0) return "";
  sockaddr_in to{};
  to.sin_family = AF_INET;
  to.sin_port = htons(53);
  inet_pton(AF_INET, "8.8.8.8", &to.sin_addr);
  sockaddr_in local{};
  socklen_t size = sizeof local;
  std::string out;
  if (::connect(fd, reinterpret_cast<const sockaddr*>(&to), sizeof to) == 0 &&
      ::getsockname(fd, reinterpret_cast<sockaddr*>(&local), &size) == 0 && local.sin_addr.s_addr != htonl(INADDR_ANY)) {
    char text[INET_ADDRSTRLEN] = {};
    if (inet_ntop(AF_INET, &local.sin_addr, text, sizeof text)) out = text;
  }
  ::close(fd);
  return out;
}

void close() {
  stopping = true;
  worker.join();
  if (listen_fd >= 0) ::close(listen_fd);
  listen_fd = -1;
  listening_port = 0;
  std::lock_guard lock(mutex);
  pending.clear();
  answers.clear();
  waiting.clear();
}
} // namespace local_server
