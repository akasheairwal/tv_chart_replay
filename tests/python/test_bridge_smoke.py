"""End-to-end QWebChannel smoke test over a real QWebEngine page.

The page loads qwebchannel.js via the qrc scheme, connects to the Python
``bridge`` object and performs a ping round trip both ways: JS -> Python
slot, and the result -> JS (written into ``document.title``).
"""

from __future__ import annotations

import pytest

from app.bridge.channel import setup_bridge

SMOKE_HTML = """<!DOCTYPE html>
<html><head><meta charset="utf-8">
<script src="qrc:///qtwebchannel/qwebchannel.js"></script>
</head><body><script>
(function () {
  function boot() {
    if (typeof QWebChannel === 'undefined') { setTimeout(boot, 25); return; }
    new QWebChannel(window.qt.webChannelTransport, function (channel) {
      var bridge = channel.objects.bridge;
      bridge.systemVersion(function (version) {
        bridge.systemPing('hello-from-js', function (result) {
          document.title = 'PINGED:' + result + ':v' + version;
        });
      });
    });
  }
  window.addEventListener('load', boot);
})();
</script></body></html>"""


@pytest.mark.integration
def test_qwebchannel_ping_round_trip(session_app, wait_until) -> None:
    from PySide6.QtWebEngineWidgets import QWebEngineView

    view = QWebEngineView()
    _channel, handler = setup_bridge(view.page(), app_version="0.1.0")
    loaded: list[bool] = []
    view.loadFinished.connect(loaded.append)
    view.setHtml(SMOKE_HTML)
    view.show()

    titles: list[str] = []

    def read_title() -> None:
        try:
            view.page().runJavaScript("document.title", lambda value: titles.append(str(value)))
        except RuntimeError:
            pass

    try:
        assert wait_until(lambda: bool(loaded)), "QWebEngine page never finished loading"
        assert loaded[-1], "QWebEngine page failed to load"

        assert wait_until(lambda: handler.ping_count >= 1), (
            "JS never pinged Python over QWebChannel"
        )
        assert handler.last_ping_message == "hello-from-js"

        def title_captured() -> bool:
            read_title()
            return bool(titles)

        assert wait_until(title_captured), "JS never echoed the result back"
        assert titles[-1] == "PINGED:pong:hello-from-js:v0.1.0"
    finally:
        view.close()
