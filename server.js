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

const pageToken = req.query.pageToken || ""

const url = pageToken
? `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=50&pageToken=${pageToken}`
: `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=in:inbox&maxResults=50`

const response = await axios.get(
url,
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
// Recherche d'emails Gmail
// ============================

app.get("/searchEmails", async (req, res) => {

try {

const token = await getAccessToken()

const query = req.query.q || ""

const response = await axios.get(
`https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(query)}&maxResults=50`,
{
headers: {
Authorization: `Bearer ${token}`
}
}
)

res.json(response.data)

} catch (error) {

console.error("Erreur searchEmails:", error.response?.data || error.message)

res.status(500).json({
error: "Impossible de rechercher les emails"
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
// Fonction extraction attachments
// ============================

function extractAttachments(payload) {

let attachments = []

function walkParts(parts) {

for (const part of parts) {

if (part.filename && part.filename.length > 0) {

```
attachments.push({
 filename: part.filename,
 mimeType: part.mimeType,
 attachmentId: part.body?.attachmentId
})
```

}

if (part.parts) {
walkParts(part.parts)
}

}

}

if (payload.parts) {
walkParts(payload.parts)
}

return attachments

}

// ============================
// Télécharger attachment Gmail
// ============================

async function downloadAttachment(token, messageId, attachmentId) {

const response = await axios.get(
`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/attachments/${attachmentId}`,
{
headers: {
Authorization: `Bearer ${token}`
}
}
)

return response.data.data

}

function decodeBase64(data) {

const base64 = data.replace(/-/g, "+").replace(/_/g, "/")

return Buffer.from(base64, "base64")

}

// ============================
// Télécharger pièce jointe
// ============================

app.get("/downloadAttachment/:messageId/:attachmentId", async (req, res) => {

try {

const token = await getAccessToken()

const { messageId, attachmentId } = req.params

const base64Data = await downloadAttachment(token, messageId, attachmentId)

const fileBuffer = decodeBase64(base64Data)

res.setHeader("Content-Type", "application/octet-stream")

res.send(fileBuffer)

} catch (error) {

console.error("Erreur downloadAttachment:", error.response?.data || error.message)

res.status(500).json({
error: "Impossible de télécharger la pièce jointe"
})

}

})

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

const attachments = extractAttachments(email.payload)

res.json({
id: email.id,
threadId: email.threadId,
snippet: email.snippet,
text: textContent,
headers: email.payload?.headers || [],
attachments: attachments
})

} catch (error) {

console.error("Erreur readEmail:", error.response?.data || error.message)

res.status(500).json({
error: "Impossible de lire cet email"
})

}

})

// ============================
// Lire toute une conversation
// ============================

app.get("/getThread/:threadId", async (req, res) => {

try {

const token = await getAccessToken()

const response = await axios.get(
`https://gmail.googleapis.com/gmail/v1/users/me/threads/${req.params.threadId}`,
{
headers: {
Authorization: `Bearer ${token}`
}
}
)

const thread = response.data

const messages = thread.messages.map(msg => {

const textContent = extractText(msg.payload)
const attachments = extractAttachments(msg.payload)

return {
id: msg.id,
threadId: msg.threadId,
snippet: msg.snippet,
text: textContent,
headers: msg.payload?.headers || [],
attachments: attachments
}

})

res.json({
threadId: thread.id,
messages: messages
})

} catch (error) {

console.error("Erreur getThread:", error.response?.data || error.message)

res.status(500).json({
error: "Impossible de lire la conversation"
})

}

})

// ============================
// Export conversation complète
// ============================

app.post("/exportConversation", async (req, res) => {

try {

const token = await getAccessToken()

const { email } = req.body

if (!email) {
return res.status(400).json({ error: "Email requis" })
}

let allMessages = []
let nextPageToken = null

const searchQuery = `from:${email} OR to:${email}`

do {

const url = nextPageToken
? `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=100&pageToken=${nextPageToken}`
: `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${encodeURIComponent(searchQuery)}&maxResults=100`

const response = await axios.get(url, {
headers: { Authorization: `Bearer ${token}` }
})

const messages = response.data.messages || []

allMessages.push(...messages)

nextPageToken = response.data.nextPageToken

} while (nextPageToken)

let detailedMessages = []

for (const msg of allMessages) {

const response = await axios.get(
`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
{
headers: { Authorization: `Bearer ${token}` }
}
)

const emailData = response.data

const textContent = extractText(emailData.payload)

const headers = emailData.payload?.headers || []

const getHeader = (name) => headers.find(h => h.name === name)?.value || ""

detailedMessages.push({
id: emailData.id,
threadId: emailData.threadId,
date: getHeader("Date"),
from: getHeader("From"),
to: getHeader("To"),
subject: getHeader("Subject"),
text: textContent
})

}

detailedMessages.sort((a, b) => new Date(a.date) - new Date(b.date))

res.json({
totalEmails: detailedMessages.length,
emails: detailedMessages
})

} catch (error) {

console.error("Erreur exportConversation:", error.response?.data || error.message)

res.status(500).json({
error: "Impossible d'exporter la conversation"
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
.replace(/+/g, "-")
.replace(///g, "_")
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
