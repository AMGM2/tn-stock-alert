import express from "express";
import crypto from "crypto";


const app = express();
const PORT = process.env.PORT || 3000;

// 👉 middleware para leer JSON (IMPORTANTE para webhooks)
app.use(express.json());

// ======================
// ENDPOINT DE PRUEBA (ya lo tenías)
app.get("/", (req, res) => {
  res.send("TN Stock Alert OK");
});
app.get("/health", (req, res) => res.send("ok"));
// ======================
// 🔔 WEBHOOK TIENDANUBE (PASO 3)
app.post("/tn/callback.", (req, res) => {
  console.log("📩 WEBHOOK RECIBIDO");
  console.log("Headers:", req.headers);
  console.log("Body:", req.body);

  // Siempre responder 200 rápido
  res.sendStatus(200);
});




// Variables de entorno
const TN_APP_ID = process.env.TN_APP_ID;
const TN_CLIENT_SECRET = process.env.TN_CLIENT_SECRET;
const TN_STORE_ID = process.env.TN_STORE_ID;
const TN_ACCESS_TOKEN = process.env.TN_ACCESS_TOKEN;
/* ======================
   CONFIG
====================== */
const REDIRECT_URI = "https://tn-stock-alert.onrender.com/tn/callback";

/* ======================
   LOG DE REQUESTS (debug)
====================== */
app.use((req, res, next) => {
  console.log("REQ", req.method, req.path, req.query);
  next();
});

// Captura raw body (necesario para HMAC)
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get("/tn/test-products", async (req, res) => {
  try {
    const r = await fetch(
      `https://api.tiendanube.com/v1/${TN_STORE_ID}/products`,
      {
        headers: {
          Authentication: `bearer ${TN_ACCESS_TOKEN}`,
          "User-Agent": "tn-stock-alert (arielgonzalezmaiilard@gmail.com)",
        },
      }
    );

    const data = await r.json();
    res.status(r.status).json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Error llamando a Tiendanube" });
  }
});

/* ======================
   UTILIDADES
====================== */

function verifyTiendaNubeHmac(req) {
  // Para webhooks, Tiendanube usa el "App Secret" (NO el client secret de OAuth)
  const secret = process.env.TIENDANUBE_APP_SECRET;
  const header = req.get("x-linkedstore-hmac-sha256");

  // Si todavía no tenés el secret real, podés descomentar para probar el flujo:
  // if (!secret) return true;

  if (!secret || !header) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(header));
  } catch {
    return false;
  }
}

async function sendTelegram(text) {
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;

  const r = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: process.env.TELEGRAM_CHAT_ID,
      text,
    }),
  });

  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
}

/* ======================
   RUTAS
====================== */

// Healthcheck
app.get("/", (req, res) => res.send("OK"));

// Test Telegram
app.get("/test-telegram", async (req, res) => {
  try {
    await sendTelegram("✅ Alerta de prueba desde Render");
    res.send("Mensaje enviado a Telegram ✅");
  } catch (e) {
    console.error(e);
    res.status(500).send(String(e.message || e));
  }
});

/**
 * INICIAR INSTALACIÓN (OAUTH)
 * Te manda a Tiendanube para autorizar y vuelve a /tn/callback con ?code=
 */
app.get("/tn/install", (req, res) => {
  const appId = process.env.TN_APP_ID;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: appId,
    redirect_uri: REDIRECT_URI,
    // state: "algo-random-opcional"
  });

  const url = `https://www.tiendanube.com/apps/authorize?${params.toString()}`;
  return res.redirect(url);
});

/**
 * CALLBACK OAUTH
 * PASO 2: intercambio de code -> access_token
 * IMPORTANTE: enviar como application/x-www-form-urlencoded
 */
app.get("/tn/callback", async (req, res) => {
  console.log("TN CALLBACK QUERY:", req.query);

  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    const body = new URLSearchParams({
      client_id: process.env.TN_APP_ID,
      client_secret: process.env.TN_CLIENT_SECRET,
      grant_type: "authorization_code",
      code: String(code),
      redirect_uri: REDIRECT_URI,
    });

    const r = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    });

    const data = await r.json();
    console.log("TN TOKEN:", data);

    if (!r.ok) {
      return res.status(400).send(JSON.stringify(data, null, 2));
    }

    // Acá idealmente guardás access_token y user_id en DB.
    // Por ahora, solo confirmamos que funcionó:
    res.send("✅ App instalada! Ya podés cerrar esta ventana.");
  } catch (e) {
    console.error(e);
    res.status(500).send("OAuth error");
  }
});

// Webhook Tiendanube (ejemplo)
app.post("/webhooks/tiendanube", async (req, res) => {
  const valid = verifyTiendaNubeHmac(req);
  if (!valid) return res.status(401).send("Invalid signature");

  const product = req.body?.name || "Producto";
  const variants = req.body?.variants || [];
  const low = variants.filter((v) => typeof v.stock === "number" && v.stock <= 2);

  if (low.length) {
    const msg =
      `⚠️ Stock bajo\n${product}\n` +
      low.map((v) => `• SKU ${v.sku || v.id}: ${v.stock}`).join("\n");

    await sendTelegram(msg);
  }

  res.send("ok");
});

// PRIVACY WEBHOOKS (OBLIGATORIOS)
app.post("/privacy/store-redact", (req, res) => {
  console.log("Store redact:", req.body);
  res.sendStatus(200);
});

app.post("/privacy/customers-redact", (req, res) => {
  console.log("Customers redact:", req.body);
  res.sendStatus(200);
});

app.post("/privacy/customers-data", (req, res) => {
  console.log("Customers data request:", req.body);
  res.sendStatus(200);
});

/* ======================
   START SERVER
====================== */
app.listen(PORT, () => {
  console.log("Servidor escuchando en puerto", PORT);
});



