const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
const ROOT = __dirname;

function send(res, statusCode, headers, body) {
  res.writeHead(statusCode, headers);
  res.end(body);
}

function serveFile(res, filePath, contentType = "text/plain; charset=utf-8") {
  fs.readFile(filePath, (err, data) => {
    if (err) {
      send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
      return;
    }

    send(res, 200, { "Content-Type": contentType }, data);
  });
}

function fetchText(targetUrl) {
  return new Promise((resolve, reject) => {
    https
      .get(
        targetUrl,
        {
          headers: {
            "User-Agent":
              "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
            Accept: "text/html,application/json;q=0.9,*/*;q=0.8",
          },
        },
        (response) => {
          if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
            const redirected = new URL(response.headers.location, targetUrl).toString();
            response.resume();
            fetchText(redirected).then(resolve).catch(reject);
            return;
          }

          const chunks = [];
          response.on("data", (chunk) => chunks.push(chunk));
          response.on("end", () => {
            const body = Buffer.concat(chunks).toString("utf8");
            if (response.statusCode && response.statusCode >= 400) {
              reject(new Error(`HTTP ${response.statusCode}`));
              return;
            }

            resolve(body);
          });
        }
      )
      .on("error", reject);
  });
}

function fetchJson(targetUrl) {
  return fetchText(targetUrl).then((text) => JSON.parse(text));
}

async function getLatestDrawNo() {
  const html = await fetchText("https://www.dhlottery.co.kr/lt645/result");
  const matches = [...html.matchAll(/(\d{3,4})회/g)].map((match) => Number(match[1])).filter(Boolean);
  if (!matches.length) {
    throw new Error("최신 회차를 찾지 못했습니다.");
  }
  return Math.max(...matches);
}

const server = http.createServer(async (req, res) => {
  const requestUrl = new URL(req.url, `http://${req.headers.host}`);

  if (requestUrl.pathname === "/" || requestUrl.pathname === "/index.html") {
    return serveFile(res, path.join(ROOT, "index.html"), "text/html; charset=utf-8");
  }

  if (requestUrl.pathname === "/server.js") {
    return serveFile(res, path.join(ROOT, "server.js"), "application/javascript; charset=utf-8");
  }

  if (requestUrl.pathname === "/api/lotto/latest") {
    try {
      const latest = await getLatestDrawNo();
      return send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ latest })
      );
    } catch (error) {
      return send(
        res,
        500,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ error: error.message })
      );
    }
  }

  const drawMatch = requestUrl.pathname.match(/^\/api\/lotto\/(\d+)$/);
  if (drawMatch) {
    try {
      const drwNo = drawMatch[1];
      const data = await fetchJson(
        `https://www.dhlottery.co.kr/common.do?method=getLottoNumber&drwNo=${encodeURIComponent(drwNo)}`
      );
      return send(
        res,
        200,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify(data)
      );
    } catch (error) {
      return send(
        res,
        500,
        { "Content-Type": "application/json; charset=utf-8" },
        JSON.stringify({ error: error.message })
      );
    }
  }

  send(res, 404, { "Content-Type": "text/plain; charset=utf-8" }, "Not Found");
});

server.listen(PORT, () => {
  console.log(`Lotto app running on http://localhost:${PORT}`);
});
