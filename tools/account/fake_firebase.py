#!/usr/bin/env python3
"""가짜 Firebase — 로그인·계정 페이지 시험 전용(표준 라이브러리만). 실제 서비스에 쓰지 않는다.

    python3 tools/account/fake_firebase.py [--site 8000] [--api 8765] [--plugin 8766]

- site   : 저장소 뿌리를 정적으로(http://127.0.0.1:8000) — 페이지는 localStorage 'gorani_account_test'로 아래 주소를 쓴다(localhost에서만)
- api    : identitytoolkit(signInWithIdp·lookup·delete)·securetoken·Realtime Database REST·가짜 구글 버튼(/gsi/client)
- plugin : 가짜 플러그인 받는 곳(POST /gorani-login → /login/done/)
오류 글은 실제 Firebase 꼴({"error": {"message": "INVALID_REFRESH_TOKEN"}}, RTDB는 {"error": "Permission denied"}).
시험 손잡이: GET /__db(전체), POST /__reset, POST /__set?<이름>=<값>(fail_signin·reauth_seconds·auth_back·disable·plan), GET /__received(받는 곳이 받은 것).
"""
import argparse
import base64
import hashlib
import json
import os
import secrets
import threading
import time
import urllib.parse
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer, BaseHTTPRequestHandler

API_KEY = "test-key"
DENY_TOKEN = {"error": "Auth token is expired"}
DENIED = {"error": "Permission denied"}
GIS_STUB = """window.google = { accounts: { id: {
  initialize: function (o) { window.__gis = o; },
  renderButton: function (el) {
    var b = document.createElement("button"); b.type = "button"; b.id = "fake-gis"; b.textContent = "Google (fake)";
    b.onclick = function () { window.__gis.callback({ credential: "fake:" + (localStorage.getItem("gorani_fake_email") || "member@example.com") }); };
    el.appendChild(b);
  } } } };
"""

LOCK = threading.Lock()
STATE = {}


def reset():
    STATE.clear()
    STATE.update(users={}, refresh={}, db={}, received=[], fail_signin=0, reauth_seconds=300, auth_back=0)


def b64(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode().rstrip("=")


def make_id_token(uid, auth_time=None):
    """가짜 ID 토큰 — 가운데 칸만 진짜처럼(email·user_id·auth_time·exp·맞춤 값 plan)."""
    user = STATE["users"][uid]
    now = int(time.time())
    payload = {"user_id": uid, "sub": uid, "email": user["email"], "auth_time": auth_time or user["auth_time"], "iat": now, "exp": now + 3600}
    if user.get("plan"):
        payload["plan"] = user["plan"]
    return b64({"alg": "none"}) + "." + b64(payload) + ".sig"


def read_id_token(token):
    """ID 토큰 → uid, 쓸 수 없으면 None(만료·사용 중지·탈퇴)."""
    try:
        payload = json.loads(base64.urlsafe_b64decode(token.split(".")[1] + "=="))
    except Exception:
        return None
    user = STATE["users"].get(payload.get("user_id"))
    if not user or user.get("disabled") or payload.get("exp", 0) < time.time():
        return None
    return payload["user_id"]


def new_refresh(uid):
    token = secrets.token_hex(24)
    STATE["refresh"][token] = uid
    return token


def check_write(path, tree):
    """RTDB 규칙의 요점 — users/<uid> 아래 history·connections만(생성 기록은 늘 저장 — 설정 없음), 기록은 built_at·host."""
    user = (tree.get("users") or {}).get(path[1]) or {}
    if set(user) - {"history", "connections"}:
        return False
    for entry in (user.get("history") or {}).values():
        if not isinstance(entry, dict) or not isinstance(entry.get("built_at"), (int, float)) or not isinstance(entry.get("host"), str):
            return False
    for conn in (user.get("connections") or {}).values():
        if not isinstance(conn, dict) or "host" not in conn or "created" not in conn:
            return False
    return True


def get_at(tree, path):
    node = tree
    for key in path:
        if not isinstance(node, dict) or key not in node:
            return None
        node = node[key]
    return node


def set_at(tree, path, value):
    """value가 None이면 지운다(빈 부모도 지운다 — RTDB처럼)."""
    if not path:
        return value if value is not None else {}
    node = tree
    for key in path[:-1]:
        node = node.setdefault(key, {})
    if value is None:
        node.pop(path[-1], None)
    else:
        node[path[-1]] = value
    return tree


def prune(node):
    if isinstance(node, dict):
        for key in list(node):
            node[key] = prune(node[key])
            if node[key] in (None, {}):
                del node[key]
    return node


class Api(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def send_json(self, status, obj, extra=None):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Access-Control-Allow-Origin", "*")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def fb_error(self, message, status=400):
        self.send_json(status, {"error": {"code": status, "message": message}})

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(n).decode() if n else ""

    def do_GET(self):
        self.route("GET")

    def do_POST(self):
        self.route("POST")

    def do_PUT(self):
        self.route("PUT")

    def do_PATCH(self):
        self.route("PATCH")

    def do_DELETE(self):
        self.route("DELETE")

    def route(self, method):
        url = urllib.parse.urlsplit(self.path)
        query = dict(urllib.parse.parse_qsl(url.query))
        text = self.body() if method in ("POST", "PUT", "PATCH") else ""
        with LOCK:
            if url.path == "/gsi/client":
                body = GIS_STUB.encode()
                self.send_response(200)
                self.send_header("Content-Type", "text/javascript")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
            elif url.path.startswith("/__"):
                self.control(url.path, query)
            elif url.path.startswith("/v1/"):
                if query.get("key") != API_KEY:
                    return self.fb_error("API key not valid. Please pass a valid API key.")
                self.identity(url.path[4:], text)
            elif url.path.endswith(".json"):
                if method == "POST" and query.get("x-http-method-override"):
                    method = query["x-http-method-override"].upper()
                self.rtdb(method, url.path[1:-5], query, text)
            else:
                self.send_json(404, {"error": "not found"})

    def control(self, path, query):
        if path == "/__db":
            return self.send_json(200, {"db": STATE["db"], "users": STATE["users"]})
        if path == "/__reset":
            reset()
        elif path == "/__set":
            for key, value in query.items():
                if key == "disable":
                    for user in STATE["users"].values():
                        if user["email"] == value:
                            user["disabled"] = True
                elif key == "plan":
                    email, plan = value.split(":")
                    for user in STATE["users"].values():
                        if user["email"] == email:
                            user["plan"] = plan
                else:
                    STATE[key] = int(value)
        elif path == "/__received":
            return self.send_json(200, STATE["received"])
        self.send_json(200, {"ok": True})

    def identity(self, name, text):
        if name == "token":   # securetoken — 폼 본문
            form = dict(urllib.parse.parse_qsl(text))
            uid = STATE["refresh"].get(form.get("refresh_token", ""))
            if form.get("grant_type") != "refresh_token" or uid is None:
                return self.fb_error("INVALID_REFRESH_TOKEN")
            user = STATE["users"].get(uid)
            if user is None:
                return self.fb_error("USER_NOT_FOUND")
            if user.get("disabled"):
                return self.fb_error("USER_DISABLED")
            return self.send_json(200, {"id_token": make_id_token(uid), "refresh_token": form["refresh_token"], "expires_in": "3600",
                                        "token_type": "Bearer", "user_id": uid, "project_id": "fake"})
        body = json.loads(text or "{}")
        if name == "accounts:signInWithIdp":
            if STATE["fail_signin"]:
                return self.fb_error("INTERNAL_ERROR", 500)
            post = dict(urllib.parse.parse_qsl(body.get("postBody", "")))
            credential = post.get("id_token", "")
            if post.get("providerId") != "google.com" or not credential.startswith("fake:"):
                return self.fb_error("INVALID_IDP_RESPONSE : bad id_token")
            email = credential[5:]
            uid = hashlib.sha1(email.encode()).hexdigest()[:28]
            user = STATE["users"].get(uid)
            if user and user.get("disabled"):
                return self.fb_error("USER_DISABLED")
            is_new = user is None
            if is_new:
                user = STATE["users"][uid] = {"email": email, "created": int(time.time() * 1000)}
            user["auth_time"] = int(time.time()) - STATE["auth_back"]   # auth_back — 오래전에 로그인한 것처럼(탈퇴 전 다시 로그인 시험)
            return self.send_json(200, {"idToken": make_id_token(uid), "refreshToken": new_refresh(uid), "localId": uid, "email": email,
                                        "isNewUser": is_new, "expiresIn": "3600", "providerId": "google.com"})
        uid = read_id_token(body.get("idToken", ""))
        if uid is None:
            return self.fb_error("INVALID_ID_TOKEN")
        user = STATE["users"][uid]
        if name == "accounts:lookup":
            return self.send_json(200, {"users": [{"localId": uid, "email": user["email"], "createdAt": str(user["created"])}]})
        if name == "accounts:delete":
            if time.time() - user["auth_time"] > STATE["reauth_seconds"]:
                return self.fb_error("CREDENTIAL_TOO_OLD_LOGIN_AGAIN")
            del STATE["users"][uid]
            for token in [t for t, u in STATE["refresh"].items() if u == uid]:
                del STATE["refresh"][token]
            return self.send_json(200, {"kind": "identitytoolkit#DeleteAccountResponse"})
        self.fb_error("UNKNOWN", 404)

    def rtdb(self, method, path_text, query, text):
        uid = read_id_token(query.get("auth", ""))
        if uid is None:
            return self.send_json(401, DENY_TOKEN)
        path = [p for p in path_text.split("/") if p]
        if len(path) < 2 or path[0] != "users" or path[1] != uid:
            return self.send_json(401, DENIED)
        if method == "GET":
            return self.send_json(200, get_at(STATE["db"], path))
        value = json.loads(text) if text else None
        tree = json.loads(json.dumps(STATE["db"]))
        if method == "PUT":
            tree = set_at(tree, path, value)
        elif method == "PATCH":
            for key, item in (value or {}).items():
                tree = set_at(tree, path + [p for p in key.split("/") if p], item)
        elif method == "DELETE":
            tree = set_at(tree, path, None)
        tree = prune(tree)
        if method != "DELETE" and not check_write(path, tree):
            return self.send_json(401, DENIED)
        STATE["db"] = tree
        self.send_json(200, None if method == "DELETE" else value)


class Server(ThreadingHTTPServer):
    def handle_error(self, request, client_address):
        pass   # 크롬이 끊은 연결(BrokenPipe 등) — 시험 출력만 어지럽힌다


def make_plugin(site):
    class Plugin(BaseHTTPRequestHandler):
        """가짜 플러그인 받는 곳 — 플러그인처럼 열쇠를 확인하고 /login/done/로 넘긴다."""
        def log_message(self, *args):
            pass

        def do_POST(self):
            n = int(self.headers.get("Content-Length") or 0)
            form = dict(urllib.parse.parse_qsl(self.rfile.read(n).decode()))
            with LOCK:
                STATE["received"].append(form)
                if form.get("error"):
                    result = "fallback=1"
                else:
                    result = "ok=1" if form.get("refresh_token") in STATE["refresh"] else "ok=0"
            self.send_response(302)
            self.send_header("Location", "%s/login/done/?%s&lang=ko&h=rhino" % (site, result))
            self.end_headers()
    return Plugin


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--site", type=int, default=8000)
    parser.add_argument("--api", type=int, default=8765)
    parser.add_argument("--plugin", type=int, default=8766)
    args = parser.parse_args()
    reset()
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

    class Site(SimpleHTTPRequestHandler):
        def __init__(self, *a, **k):
            super().__init__(*a, directory=root, **k)

        def log_message(self, *a):
            pass

    servers = [Server(("127.0.0.1", args.site), Site), Server(("127.0.0.1", args.api), Api),
               Server(("127.0.0.1", args.plugin), make_plugin("http://127.0.0.1:%d" % args.site))]
    for server in servers[1:]:
        threading.Thread(target=server.serve_forever, daemon=True).start()
    print("ready site=%d api=%d plugin=%d" % (args.site, args.api, args.plugin), flush=True)
    servers[0].serve_forever()


if __name__ == "__main__":
    main()
