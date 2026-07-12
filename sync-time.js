// api/sync-time.js
//
// Endpoint serverless de Vercel que sincroniza la hora del servidor
// de ER:LC con la hora actual de Madrid (Europe/Madrid), usando el
// comando ":time <0-23>" a través de la API oficial de PRC.
//
// NO ejecuta nada por sí solo: hay que llamarlo desde fuera cada
// cierto tiempo (ver .github/workflows/sync-time.yml). El plan
// gratuito de Vercel ("Hobby") solo permite cron jobs 1 vez al día,
// así que el disparador periódico se hace con GitHub Actions, que sí
// es gratis y admite frecuencias más altas.
//
// VARIABLES DE ENTORNO NECESARIAS (se configuran en Vercel, no aquí):
//   ERLC_API_KEY  -> la Server API Key de tu servidor privado de ER:LC
//   SYNC_SECRET   -> una contraseña inventada por ti (cualquier string
//                    largo y aleatorio) para que nadie más pueda
//                    llamar a este endpoint y cambiarte la hora.

export default async function handler(req, res) {
  // --- 1. Autenticación simple con un secreto compartido ---
  const secretoRecibido = req.headers["x-sync-secret"] || req.query.secret;
  const secretoEsperado = process.env.SYNC_SECRET;

  if (!secretoEsperado) {
    return res.status(500).json({ error: "Falta configurar SYNC_SECRET en Vercel" });
  }
  if (secretoRecibido !== secretoEsperado) {
    return res.status(401).json({ error: "No autorizado" });
  }

  // --- 2. Clave de la API de ER:LC ---
  const apiKey = process.env.ERLC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Falta configurar ERLC_API_KEY en Vercel" });
  }

  // --- 3. Calcular la hora actual en Madrid (0-23) ---
  const horaTexto = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Madrid",
    hour: "numeric",
    hour12: false,
  }).format(new Date());
  // Intl a veces devuelve "24" para la medianoche en vez de "0"
  const hora = parseInt(horaTexto, 10) % 24;

  // --- 4. Mandar el comando a la API de ER:LC ---
  try {
    const respuestaApi = await fetch("https://api.erlc.gg/v2/server/command", {
      method: "POST",
      headers: {
        "server-key": apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ command: `:time ${hora}` }),
    });

    let cuerpo = null;
    try {
      cuerpo = await respuestaApi.json();
    } catch {
      cuerpo = await respuestaApi.text();
    }

    if (!respuestaApi.ok) {
      return res.status(respuestaApi.status).json({
        error: "La API de ER:LC devolvió un error",
        status_erlc: respuestaApi.status,
        detalle: cuerpo,
      });
    }

    return res.status(200).json({
      ok: true,
      hora_madrid_enviada: hora,
      respuesta_erlc: cuerpo,
    });
  } catch (error) {
    return res.status(500).json({
      error: "Error de red al hablar con la API de ER:LC",
      detalle: String(error),
    });
  }
}
