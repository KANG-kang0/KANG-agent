#!/usr/bin/env python3
"""啟動本地 server 跑 小書蟲 web 版

執行：python3 serve.py
瀏覽器會自動打開 http://localhost:8000
"""
import http.server
import socketserver
import webbrowser
import os
import sys
from pathlib import Path

PORT = 8000
WEB_DIR = Path(__file__).parent.resolve()


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_DIR), **kwargs)

    def end_headers(self):
        # 開發時關掉 cache，改完馬上看得到
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()

    def log_message(self, format, *args):
        # 安靜一點，只印錯誤
        if args and str(args[1]).startswith(('4', '5')):
            super().log_message(format, *args)


def main():
    os.chdir(WEB_DIR)
    try:
        with socketserver.TCPServer(("", PORT), Handler) as httpd:
            url = f"http://localhost:{PORT}"
            print(f"🌐 小書蟲 跑在 {url}")
            print(f"📱 想在 iPhone 上裝成 app，部署到 Cloudflare Pages（README 有教）")
            print(f"按 Ctrl+C 結束")
            webbrowser.open(url)
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n👋 掰掰")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:
            print(f"❌ Port {PORT} 已被使用，請關掉佔用的程式或改用其他 port")
        else:
            raise


if __name__ == '__main__':
    main()
