#!/usr/bin/env python3
"""쓰레드 자동 게시 스크립트.

posts_queue.json 에서 예약 시간이 지난 미게시 글을 골라 Threads API 로 올리고,
링크가 있으면 대가성 문구를 붙인 답글로 첨부한다.

환경변수
  THREADS_ACCESS_TOKEN  Threads API 장기 토큰 (threads_basic, threads_content_publish, threads_manage_replies)
  THREADS_USER_ID       쓰레드 사용자 ID (토큰 발급 후 /me 로 확인)
  COUPANG_ACCESS_KEY    (선택) 쿠팡파트너스 Open API 키. 있으면 상품 URL을 파트너스 링크로 자동 변환
  COUPANG_SECRET_KEY    (선택)

사용법
  python3 threads_post.py --dry-run   # 올릴 글만 출력
  python3 threads_post.py             # 실제 게시 (한 번 실행에 최대 1건)
"""
import argparse
import datetime as dt
import hashlib
import hmac
import json
import os
import time
import urllib.parse
import urllib.request
from pathlib import Path

API = "https://graph.threads.net/v1.0"
QUEUE = Path(__file__).with_name("posts_queue.json")
LINK_LOG = Path(__file__).with_name("coupang_links_log.jsonl")  # 번호/상품명/링크 기록
KST = dt.timezone(dt.timedelta(hours=9))
DISCLOSURE = "[광고] 이 포스팅은 쿠팡 파트너스 활동의 일환으로, 이에 따른 일정액의 수수료를 제공받습니다."


def post_form(url, data):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode(), method="POST")
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.load(r)


def publish(text, image_url=None, reply_to_id=None):
    token = os.environ["THREADS_ACCESS_TOKEN"]
    user_id = os.environ["THREADS_USER_ID"]
    data = {"access_token": token, "text": text, "media_type": "IMAGE" if image_url else "TEXT"}
    if image_url:
        data["image_url"] = image_url
    if reply_to_id:
        data["reply_to_id"] = reply_to_id
    creation = post_form(f"{API}/{user_id}/threads", data)["id"]
    time.sleep(30 if image_url else 5)  # 컨테이너 처리 대기 (Meta 권장)
    return post_form(f"{API}/{user_id}/threads_publish", {"access_token": token, "creation_id": creation})["id"]


def coupang_deeplink(urls):
    """쿠팡 상품 URL을 파트너스 단축 링크로 변환. 키가 없으면 원본 반환."""
    ak, sk = os.environ.get("COUPANG_ACCESS_KEY"), os.environ.get("COUPANG_SECRET_KEY")
    if not (ak and sk):
        return urls
    path = "/v2/providers/affiliate_open_api/apis/openapi/v1/deeplink"
    signed = dt.datetime.now(dt.timezone.utc).strftime("%y%m%dT%H%M%SZ")
    sig = hmac.new(sk.encode(), f"{signed}POST{path}".encode(), hashlib.sha256).hexdigest()
    req = urllib.request.Request(
        "https://api-gateway.coupang.com" + path,
        data=json.dumps({"coupangUrls": urls}).encode(),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Authorization": f"CEA algorithm=HmacSHA256, access-key={ak}, signed-date={signed}, signature={sig}",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        return [d["shortenUrl"] for d in json.load(r)["data"]]


def write_csv():
    """구글시트가 IMPORTDATA로 읽는 공개 CSV (번호/게시일시/상품명/쿠팡 링크/쓰레드 글 링크/게시 ID)."""
    import csv
    rows = [json.loads(l) for l in LINK_LOG.read_text(encoding="utf-8").splitlines() if l.strip()]
    with LINK_LOG.with_suffix(".csv").open("w", encoding="utf-8", newline="") as fh:
        w = csv.writer(fh)
        for r in rows:
            w.writerow([r[0], r[1], r[2], r[3], r[4], "'" + str(r[5])])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    queue = json.loads(QUEUE.read_text())
    now = dt.datetime.now(KST)
    due = [p for p in queue if not p.get("posted_id") and dt.datetime.fromisoformat(p["at"]) <= now]
    if not due:
        print("올릴 글 없음")
        return
    p = due[0]
    links = p.get("links") or []
    if p.get("format") == "링크" and not links:
        # 링크 없는 링크 글은 올리지 않고 건너뜀 ("링크는 댓글에"라는 본문이 거짓이 됨)
        p["posted_id"] = "SKIPPED_NO_LINK"
        QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=2))
        print("건너뜀(링크 없음):", p["at"], p.get("product"))
        return
    text = p["text"]
    reply = None
    if links:
        # 링크 글 번호: 지금까지 실제 게시된 링크 글 다음 번호 (건너뛴 글은 번호 안 씀)
        if not p.get("no"):
            p["no"] = max([q.get("no") or 0 for q in queue], default=0) + 1
        # 대가성 문구는 본문 첫 줄, 그 뒤 원문 시작에 번호, 링크는 답글에만
        body = text[len("[광고]"):].lstrip() if text.startswith("[광고]") else text
        intro = (p.get("intro") or "").strip()
        text = DISCLOSURE + "\n\n" + (intro + "\n\n" if intro else "") + f"No.{p['no']} " + body
        links = coupang_deeplink(links)
        p["final_links"] = links
        reply = "\n".join(f"👉 {l}" for l in links)

    print(f"[{p['at']}] {p['format']}\n{text}\n--- 답글 ---\n{reply}\n")
    if args.dry_run:
        return
    try:
        p["posted_id"] = publish(text, p.get("image_url"))
    except Exception as e:
        if not p.get("image_url"):
            raise
        print("이미지 게시 실패, 텍스트로 다시 게시:", e)
        p["image_failed"] = True
        p["posted_id"] = publish(text)
    if reply:
        p["reply_id"] = publish(reply, reply_to_id=p["posted_id"])
    p["posted_at"] = now.isoformat()
    QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=2))
    print("게시 완료:", p["posted_id"])
    if p.get("no"):
        # 구글시트 기록용 한 줄 (예약 작업이 이 줄을 시트에 추가)
        try:
            q = urllib.parse.urlencode({"fields": "permalink", "access_token": os.environ["THREADS_ACCESS_TOKEN"]})
            with urllib.request.urlopen(f"{API}/{p['posted_id']}?{q}", timeout=30) as r:
                p["permalink"] = json.load(r).get("permalink", "")
            QUEUE.write_text(json.dumps(queue, ensure_ascii=False, indent=2))
        except Exception:
            pass
        row = [p["no"], now.strftime("%Y-%m-%d %H:%M"), p.get("product", ""), " ".join(p["final_links"]), p.get("permalink", ""), p["posted_id"]]
        with LINK_LOG.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(row, ensure_ascii=False) + "\n")
        write_csv()
        print("SHEET_ROW", json.dumps(row, ensure_ascii=False))


if __name__ == "__main__":
    main()
