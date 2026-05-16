export default async function handler(req, res) {
  // Solo permitimos peticiones POST (de envío)
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const { email, nombreIglesia, html } = req.body;

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer re_LViYq1tr_6UywE63tXwJfEQUNezGzyjYU"
      },
      body: JSON.stringify({
        from: `${nombreIglesia} <rifa@impquintanormal.cl>`,
        to: [email],
        subject: `✝ Participación recibida – Rifa ${nombreIglesia}`,
        html: html
      })
    });

    const data = await response.json();
    return res.status(response.status).json(data);
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
}