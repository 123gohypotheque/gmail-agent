const express = require("express")
const axios = require("axios")
const cors = require("cors")

const app = express()

app.use(cors())
app.use(express.json({ limit: "50mb" }))
app.use(express.urlencoded({ limit: "50mb", extended: true }))

// Variables d'environnement
const CLIENT_ID = process.env.CLIENT_ID
const CLIENT_SECRET = process.env.CLIENT_SECRET
const REFRESH_TOKEN = process.env.REFRESH_TOKEN

// ============================
// Obtenir access token Gmail
// ============================

async function getAccessToken() {

 try {

  const response = await axios.post(
   "https://oauth2.googleapis.com/token",
   {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    refresh_token: REFRESH_TOKEN,
    grant_type: "refresh_token"
   }
  )

  return response.data.access_token

 } catch (error) {

  console.error("Erreur getAccessToken:", error.response?.data || error.message)
  throw error

 }

}

// ============================
// Lire la boîte de réception
// ============================

app.get("/readInbox", async (req, res) => {

 try {

  const token = await getAccessToken()

  const response = await axios.get(
   "https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=10",
   {
    headers: {
     Authorization: `Bearer ${token}`
    }
   }
  )

  res.json(response.data)

 } catch (error) {

  console.error("Erreur readInbox:", error.response?.data || error.message)

  res.status(500).json({
   error: "Impossible de lire la boite Gmail"
  })

 }

})

// ============================
// Fonction pour extraire texte
// ============================

function extractText(payload) {

 if (!payload) return ""

 if (payload.mimeType === "text/plain" && payload.body?.data) {

  return Buffer.from(payload.body.data, "base64").toString("utf8")

 }

 if (payload.parts) {

  for (const part of payload.parts) {

   const result = extractText(part)

   if (result) return result

  }

 }

 return ""

}

// ============================
// Lire un email spécifique
// ============================

app.get("/readEmail/:id", async (req, res) => {

 try {

  const token = await getAccessToken()

  const response = await axios.get(
   `https://gmail.googleapis.com/gmail/v1/users/me/messages/${req.params.id}?format=full`,
   {
    headers: {
     Authorization: `Bearer ${token}`
    }
   }
  )

  const email = response.data

  const textContent = extractText(email.payload)

  res.json({
   id: email.id,
   threadId: email.threadId,
   snippet: email.snippet,
   text: textContent,
   headers: email.payload?.headers || []
  })

 } catch (error) {

  console.error("Erreur readEmail:", error.response?.data || error.message)

  res.status(500).json({
   error: "Impossible de lire cet email"
  })

 }

})

// ============================
// Envoyer un email
// ============================

app.post("/sendEmail", async (req, res) => {

 try {

  const token = await getAccessToken()

  const { to, subject, message } = req.body

  const email = [
   `To: ${to}`,
   "Content-Type: text/plain; charset=utf-8",
   `Subject: ${subject}`,
   "",
   message
  ].join("\n")

  const encodedMessage = Buffer.from(email)
   .toString("base64")
   .replace(/\+/g, "-")
   .replace(/\//g, "_")
   .replace(/=+$/, "")

  const response = await axios.post(
   "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
   {
    raw: encodedMessage
   },
   {
    headers: {
     Authorization: `Bearer ${token}`
    }
   }
  )

  res.json(response.data)

 } catch (error) {

  console.error("Erreur sendEmail:", error.response?.data || error.message)

  res.status(500).json({
   error: "Impossible d'envoyer l'email"
  })

 }

})

// ============================
// Port Render
// ============================

const PORT = process.env.PORT || 3000

app.listen(PORT, "0.0.0.0", () => {

 console.log(`Gmail agent running on port ${PORT}`)

})
