const { generateKeyPairSync } = require("crypto");
const fs = require("fs");
const path = require("path");

const { publicKey, privateKey } = generateKeyPairSync("ec", {
	namedCurve: "prime256v1",
	publicKeyEncoding: { type: "spki", format: "pem" },
	privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

fs.writeFileSync(path.join(__dirname, "tesla-public-key.pem"), publicKey);
fs.writeFileSync(path.join(__dirname, "tesla-private-key.pem"), privateKey);

console.log("Keys generated:");
console.log("  tesla-public-key.pem");
console.log("  tesla-private-key.pem");
console.log("\nPublic key contents (this will be served at /.well-known/...):");
console.log(publicKey);
