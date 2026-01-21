import express from "express";
const app = express();

app.get("/", (req, res) => res.send("OK"));
app.get("/test-telegram", async (req, res) => {
  try {
    const text = "✅ Alerta de prueba desde Render";
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

    res.send("Mensaje enviado a Telegram ✅");
  } catch (e) {
    console.error(e);
    res.status(500).send(`Error enviando mensaje: ${e.message}`);
  }
});



const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));


import express from "express";
import crypto from "crypto";

const app = express();

// Captura raw body (necesario para HMAC)
app.use(express.json({
  verify: (req, res, buf) => { req.rawBody = buf; }
}));

function verifyTiendaNubeHmac(req) {
  const secret = process.env.TIENDANUBE_APP_SECRET;
  const header = req.get("x-linkedstore-hmac-sha256"); // firma

  // Si todavía no tenés secret real, podés desactivar esto temporalmente:
  if (!secret || !header) return false;

  const digest = crypto
    .createHmac("sha256", secret)
    .update(req.rawBody)
    .digest("base64");

  // Comparación segura
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
    body: JSON.stringify({ chat_id: process.env.TELEGRAM_CHAT_ID, text })
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data));
}

// Webhook Tienda Nube
app.post("/webhooks/tiendanube", async (req, res) => {
  // 1) Verificar firma (recomendado en producción)
  const ok = verifyTiendaNubeHmac(req);
  if (!ok) {
    // Mientras no tengas el SECRET real, podés comentar este return para testear.
    return res.status(401).send("Invalid signature");
  }

  // 2) Leer payload
  const payload = req.body;
  const productName = payload?.name || payload?.title || "Producto";
  const variants = Array.isArray(payload?.variants) ? payload.variants : [];

  // 3) Buscar stock bajo (<=2)
  const low = variants
    .map(v => ({ id: v.id, sku: v.sku, stock: v.stock }))
    .filter(v => typeof v.stock === "number" && v.stock <= 2);

  if (low.length) {
    const lines = low.map(v => `• Variante ${v.id}${v.sku ? ` (SKU ${v.sku})` : ""}: stock ${v.stock}`);
    const msg = `⚠️ Stock bajo (Tienda Nube)\n${productName}\n${lines.join("\n")}`;
    await sendTelegram(msg);
  }

  res.status(200).send("ok");
});
