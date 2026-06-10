import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

var root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
var certPath = path.join(root, "mTLS", "약먹을시간_public.crt");
var keyPath = path.join(root, "mTLS", "약먹을시간_private.key");

if (!fs.existsSync(certPath) || !fs.existsSync(keyPath)) {
  console.error("mTLS 폴더에 약먹을시간_public.crt / 약먹을시간_private.key 가 없어요.");
  process.exit(1);
}

var cert = fs.readFileSync(certPath, "utf8").trim();
var key = fs.readFileSync(keyPath, "utf8").trim();

console.log("=== Render Environment 에 넣을 값 (각각 Add) ===\n");
console.log("NAME: TOSS_MTLS_CERT");
console.log("VALUE:\n" + cert + "\n");
console.log("---");
console.log("NAME: TOSS_MTLS_KEY");
console.log("VALUE:\n" + key + "\n");
console.log("=== 끝. 붙여넣은 뒤 재배포 → /api/health 에서 mtls: true 확인 ===");
