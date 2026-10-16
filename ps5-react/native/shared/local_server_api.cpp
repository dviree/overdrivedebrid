// Copyright (C) 2026 half144 and PS5 React contributors
// SPDX-License-Identifier: GPL-3.0-or-later
// Additional attribution term: see LICENSE-ATTRIBUTION.
#include "host_api.hpp"
#include "local_server.hpp"
#include "network.hpp"
#include <cmath>

namespace {
bool integer(JSContext* ctx, JSValueConst value, double minimum, double maximum, double& out) {
  return JS_IsNumber(value) && !JS_ToFloat64(ctx, &out, value) && std::isfinite(out) && out == std::floor(out) &&
         out >= minimum && out <= maximum;
}

bool text(JSContext* ctx, JSValueConst value, std::size_t maximum, std::string& out) {
  if (!JS_IsString(value)) return false;
  std::size_t size = 0;
  const char* bytes = JS_ToCStringLen(ctx, &size, value);
  if (!bytes) return false;
  const bool fits = size <= maximum;
  if (fits) out.assign(bytes, size);
  JS_FreeCString(ctx, bytes);
  return fits;
}

JSValue listen(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  double port = 0;
  if (!argc || !integer(ctx, argv[0], 1024, 65535, port)) return JS_ThrowTypeError(ctx, "server.listen: expected port 1024..65535");
  if (!network::running())
    return JS_ThrowPlainError(ctx, "server.listen %d: enable networking: true and filesystemAccess: console in app.json",
                              static_cast<int>(port));
  std::string error;
  if (!local_server::listen(static_cast<std::uint16_t>(port), error))
    return JS_ThrowPlainError(ctx, "server.listen %d: %s", static_cast<int>(port), error.c_str());
  return JS_UNDEFINED;
}

JSValue poll(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  JSValue out = JS_NewArray(ctx);
  std::uint32_t index = 0;
  for (const auto& request : local_server::poll()) {
    JSValue item = JS_NewObject(ctx);
    JS_SetPropertyStr(ctx, item, "id", JS_NewUint32(ctx, request.id));
    JS_SetPropertyStr(ctx, item, "method", JS_NewStringLen(ctx, request.method.data(), request.method.size()));
    JS_SetPropertyStr(ctx, item, "path", JS_NewStringLen(ctx, request.path.data(), request.path.size()));
    JS_SetPropertyStr(ctx, item, "address", JS_NewString(ctx, request.address.c_str()));
    JS_SetPropertyStr(ctx, item, "contentType", JS_NewStringLen(ctx, request.content_type.data(), request.content_type.size()));
    JS_SetPropertyStr(ctx, item, "body", JS_NewStringLen(ctx, request.body.data(), request.body.size()));
    JS_SetPropertyUint32(ctx, out, index++, item);
  }
  return out;
}

JSValue respond(JSContext* ctx, JSValueConst, int argc, JSValueConst* argv) {
  std::uint32_t id = 0;
  double status = 0;
  std::string type, body;
  if (argc < 4 || JS_ToUint32(ctx, &id, argv[0]) || !integer(ctx, argv[1], 100, 599, status) || !text(ctx, argv[2], 256, type) ||
      !text(ctx, argv[3], local_server::kMaxResponseBytes, body))
    return JS_ThrowTypeError(ctx, "server.respond: expected id, status 100..599, a content type and a body of at most %zu bytes",
                             local_server::kMaxResponseBytes);
  for (const char c : type)
    if (c == '\r' || c == '\n') return JS_ThrowTypeError(ctx, "server.respond: the content type has a line break");
  return JS_NewBool(ctx, local_server::respond(id, static_cast<int>(status), std::move(type), std::move(body)));
}

JSValue port(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  return JS_NewUint32(ctx, local_server::port());
}

JSValue address(JSContext* ctx, JSValueConst, int, JSValueConst*) {
  const std::string found = local_server::address();
  return found.empty() ? JS_NULL : JS_NewString(ctx, found.c_str());
}

JSValue close(JSContext*, JSValueConst, int, JSValueConst*) {
  local_server::close();
  return JS_UNDEFINED;
}
} // namespace

JSValue ps5_react_local_server_api(JSContext* ctx) {
  JSValue api = JS_NewObject(ctx);
  JS_SetPropertyStr(ctx, api, "listen", JS_NewCFunction(ctx, listen, "listen", 1));
  JS_SetPropertyStr(ctx, api, "poll", JS_NewCFunction(ctx, poll, "poll", 0));
  JS_SetPropertyStr(ctx, api, "respond", JS_NewCFunction(ctx, respond, "respond", 4));
  JS_SetPropertyStr(ctx, api, "port", JS_NewCFunction(ctx, port, "port", 0));
  JS_SetPropertyStr(ctx, api, "address", JS_NewCFunction(ctx, address, "address", 0));
  JS_SetPropertyStr(ctx, api, "close", JS_NewCFunction(ctx, close, "close", 0));
  return api;
}
