import https from "node:https";
import { constants } from "node:crypto";

const req = https.request(
  {
    host: "127.0.0.1",
    port: 8083,
    path: "/",
    method: "GET",
    rejectUnauthorized: false,       // the agent's certificate is a self-signed 2016 file
    minVersion: "TLSv1",
    ciphers: "ALL:@SECLEVEL=0",      // allow the agent's old ciphers
    secureOptions: constants.SSL_OP_LEGACY_SERVER_CONNECT, // allow old TLS renegotiation
  },
  (res) => {
    console.log("HTTP status:", res.statusCode);
    console.log("TLS:", res.socket.getProtocol(), "| cipher:", res.socket.getCipher().name);
    res.resume();
  },
);
req.on("error", (e) => console.error("FAILED:", e.code, e.message));
req.end();
