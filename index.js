import express from "express";
const app = express();

app.get("/", (req, res) => res.send("OK"));
app.get("/test-telegram", async (req, res) => {
  try {
    const text = "Alerta de prueba desde Render";
    const url = `https://api.telegram.org/bot${process.env.8409634111:AAHUs0utB-4u1Z3isWZ4nZ1p_VB1pIQS4TI}/sendMessage`;

    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: process.env.TELEGRAM_CHAT_ID,
        text
      })
    });

    if (!r.ok) throw new Error("Telegram error");

    res.send("Mensaje enviado a Telegram");
  } catch (e) {
    console.error(e);
    res.status(500).send("Error enviando mensaje");
  }
});


const port = process.env.PORT || 3000;
app.listen(port, () => console.log("Running on", port));
