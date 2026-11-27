import bcrypt from "bcryptjs";
const pin = process.argv[2];
if (!/^\d{6}$/.test(pin ?? "")) { console.error("Uso: npm run hash-pin -- 123456 (6 dígitos)"); process.exit(1); }
console.log("ADMIN_PIN_HASH='" + bcrypt.hashSync(pin, 12) + "'");
