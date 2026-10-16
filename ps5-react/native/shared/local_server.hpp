// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
// A small HTTP/1.1 server on the local network, so an app can be reached from a computer's browser
// (http://<console address>:<port>/). One worker accepts and reads up to 16 connections at once;
// each request goes to JavaScript through poll() and its answer comes back through respond().
// Requests are bounded (headers 16 KiB, body 256 KiB) and every connection closes after its response.
#pragma once
#include <cstddef>
#include <cstdint>
#include <string>
#include <vector>

namespace local_server {
inline constexpr std::size_t kMaxHeaderBytes = 16 * 1024, kMaxBodyBytes = 256 * 1024;
inline constexpr std::size_t kMaxResponseBytes = 4 * 1024 * 1024;
inline constexpr int kReadTimeoutMs = 5000, kAnswerTimeoutMs = 15000;
inline constexpr std::size_t kMaxConnections = 16;

struct Request {
  std::uint32_t id = 0;
  std::string method, path, address, content_type, body;
};

// Listens on 0.0.0.0:`port`. False with `error` set when it cannot; a server already listening on
// another port is closed first.
bool listen(std::uint16_t port, std::string& error);
// Requests read since the last poll, oldest first.
std::vector<Request> poll();
// Queues the answer to request `id`; false when it is no longer waiting (it timed out with a 504).
bool respond(std::uint32_t id, int status, std::string content_type, std::string body);
// The port listened on, 0 when closed.
std::uint16_t port();
// The console's IPv4 address on the network, dotted, or "" when it has none.
std::string address();
// Stops listening and joins the worker.
void close();
} // namespace local_server
