import express from "express";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

/* ======================
   PASO 2: REDIRECT_URI EXACTO
   (Tiene que ser idéntico al de Partners)
====================== */
const REDIRECT_URI = "https://tn-stock-alert.onrender.com/tn/callback";

/* ======================
   PASO 3: LOG DE REQUESTS
   (Para ver si Tiendanube llega o no)
====================== */
app.use((req, res, next) => {
  console.log("REQ", req.method, req.path, req.query);
  next();
});

// Captura raw body (necesario para HMAC)
app.use(express.json({
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

/* ======================
   UTILIDADES
====================== */

function verifyTiendaNubeHmac(req) {
  // OJO: para webhooks NO es TN_CLIENT_SECRET.
  // Ideal: process.env.TIENDANUBE_APP_SECRET
  const secret = process.env.TIENDANUBE_APP_SECRET;
  const header = req.get("x-linkedstore-hmac-sha256");

  // Mientras no tengas el secret real, podés devolver true para probar:
  // if (!secret) return true;

  if (!secret || !header) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  try {
    return crypto.timingSafeEqual(
      Buffer.from(digest),
      Buffer.from(header)
    );
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
      text
    })
  });

  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
}

/* ======================
   RUTAS
====================== */

// Healthcheck
app.get("/", (req, res) => res.send("OK"));

// Iniciar instalación OAuth (opcional, pero útil)
app.get("/tn/install", (req, res) => {
  const appId = process.env.TN_APP_ID;
  const redirectUri = encodeURIComponent(REDIRECT_URI);

  const url = `https://www.tiendanube.com/apps/${appId}/authorize?redirect_uri=${redirectUri}`;
  return res.redirect(url);
});
const REDIRECT_URI = "https://tn-stock-alert.onrender.com/tn/callback";

/* ======================
   RUTAS
====================== */

// Healthcheck
app.get("/", (req, res) => res.send("OK"));

/* 👉 NUEVO: INSTALACIÓN APP TIENDANUBE */
app.get("/tn/install", (req, res) => {
  const appId = process.env.TN_APP_ID;

  const params = new URLSearchParams({
    response_type: "code",
    client_id: appId,
    redirect_uri: REDIRECT_URI,
  });

  const url = `https://www.tiendanube.com/apps/authorize?${params.toString()}`;
  return res.redirect(url);
});

// OAuth callback Tiendanube
app.get("/tn/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    const r = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.TN_APP_ID,
        client_secret: process.env.TN_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    const data = await r.json();
    console.log("TN TOKEN:", data);

    if (!r.ok) {
      return res.status(400).send(JSON.stringify(data));
    }

    res.send("✅ App instalada! Ya podés cerrar esta ventana.");
  } catch (e) {
    console.error(e);
    res.status(500).send("OAuth error");
  }
});


 

// Test Telegram
app.get("/test-telegram", async (req, res) => {
  try {
    await sendTelegram("✅ Alerta de prueba desde Render");
    res.send("Mensaje enviado a Telegram ✅");
  } catch (e) {
    console.error(e);
    res.status(500).send(e.message);
  }
});

// OAuth callback Tiendanube
app.get("/tn/callback", async (req, res) => {
  const { code } = req.query;
  if (!code) return res.status(400).send("Missing code");

  try {
    const r = await fetch("https://www.tiendanube.com/apps/authorize/token", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: process.env.TN_APP_ID,
        client_secret: process.env.TN_CLIENT_SECRET,
        grant_type: "authorization_code",
        code,
        redirect_uri: REDIRECT_URI
      })
    });

    const data = await r.json();
    console.log("TN TOKEN:", data);

    if (!r.ok) {
      return res.status(400).send(JSON.stringify(data));
    }

    res.send("✅ App instalada! Ya podés cerrar esta ventana.");
  } catch (e) {
    console.error(e);
    res.status(500).send("OAuth error");
  }
});

// Webhook Tiendanube
app.post("/webhooks/tiendanube", async (req, res) => {
  const valid = verifyTiendaNubeHmac(req);
  if (!valid) return res.status(401).send("Invalid signature");

  const product = req.body?.name || "Producto";
  const variants = req.body?.variants || [];

  const low = variants.filter(v => typeof v.stock === "number" && v.stock <= 2);

  if (low.length) {
    const msg =
      `⚠️ Stock bajo\n${product}\n` +
      low.map(v => `• SKU ${v.sku || v.id}: ${v.stock}`).join("\n");

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
