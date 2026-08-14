import "dotenv/config";
import { exchangeForLongLivedToken } from "./graph.js";

const { META_APP_ID, META_APP_SECRET, META_ACCESS_TOKEN } = process.env;

if (!META_APP_ID || !META_APP_SECRET || !META_ACCESS_TOKEN) {
  console.error(
    "Necesitas META_APP_ID, META_APP_SECRET y META_ACCESS_TOKEN (el token corto) en tu .env"
  );
  process.exit(1);
}

const result = await exchangeForLongLivedToken({
  appId: META_APP_ID,
  appSecret: META_APP_SECRET,
  shortToken: META_ACCESS_TOKEN,
});

console.log("\nToken de larga duracion (dura ~60 dias):\n");
console.log(result.access_token);
console.log("\nSustituye META_ACCESS_TOKEN en tu .env por este valor.");
