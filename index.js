const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require("@whiskeysockets/baileys")
const P = require("pino")
const fs = require("fs")
const path = require("path")

// Database file
const USERS_DB = path.join(__dirname, "data", "users.json")

function loadUsers() {
  if (!fs.existsSync(USERS_DB)) return {}
  return JSON.parse(fs.readFileSync(USERS_DB))
}

function saveUsers(data) {
  fs.writeFileSync(USERS_DB, JSON.stringify(data, null, 2))
}

// Bahasa
const LANGUAGES = {
  en: {
    registration: `*Registration in Progress*\nPlease Select Your Language\n\n1. English\n2. Indonesia\n3. Русия\n4. Português\n\nReply to this message with numbers *1 - 4* to choose*`,
    registered: "✅ You have successfully registered!",
    needRegister: "⚠️ You must register first using *.register*",
    menu: "📌 Menu:\n1. .set name/age/gender\n2. .menu\n3. .ping\n4. .info",
    ping: "🏓 Pong!",
    info: "ℹ️ This is Shizuka Bot.",
  },
  id: {
    registration: `*Registrasi Sedang Berlangsung*\nSilakan Pilih Bahasa\n\n1. English\n2. Indonesia\n3. Русия\n4. Português\n\nBalas pesan ini dengan angka *1 - 4* untuk memilih*`,
    registered: "✅ Kamu berhasil registrasi!",
    needRegister: "⚠️ Kamu harus registrasi dulu dengan *.register*",
    menu: "📌 Menu:\n1. .set name/age/gender\n2. .menu\n3. .ping\n4. .info",
    ping: "🏓 Pong!",
    info: "ℹ️ Ini adalah Shizuka Bot.",
  },
  ru: {
    registration: `*Регистрация в процессе*\nПожалуйста, выберите язык\n\n1. English\n2. Indonesia\n3. Русия\n4. Português\n\nОтветьте на это сообщение, выбрав число *1 - 4*`,
    registered: "✅ Вы успешно зарегистрировались!",
    needRegister: "⚠️ Сначала нужно зарегистрироваться с помощью *.register*",
    menu: "📌 Меню:\n1. .set name/age/gender\n2. .menu\n3. .ping\n4. .info",
    ping: "🏓 Понг!",
    info: "ℹ️ Это Shizuka Bot.",
  },
  pt: {
    registration: `*Registro em andamento*\nPor favor, selecione seu idioma\n\n1. English\n2. Indonesia\n3. Русия\n4. Português\n\nResponda a esta mensagem com os números *1 - 4* para escolher*`,
    registered: "✅ Você se registrou com sucesso!",
    needRegister: "⚠️ Você deve se registrar primeiro usando *.register*",
    menu: "📌 Menu:\n1. .set name/age/gender\n2. .menu\n3. .ping\n4. .info",
    ping: "🏓 Pong!",
    info: "ℹ️ Este é o Shizuka Bot.",
  },
}

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("auth_info")
  const { version } = await fetchLatestBaileysVersion()

  const sock = makeWASocket({
    version,
    logger: P({ level: "silent" }),
    auth: state,
    printQRInTerminal: false, // 🚫 QR dimatikan
    browser: ["Shizuka Bot", "Chrome", "1.0"],
  })

  // Pairing code kalau belum terdaftar
  if (!sock.authState.creds.registered) {
    const phoneNumber = "62xxxxxxxxxx" // Ganti nomor kamu (awali dengan kode negara)
    const code = await sock.requestPairingCode(phoneNumber)
    console.log("👉 Pairing code:", code)
    console.log("Masukkan pairing code ini di WhatsApp > Perangkat Tertaut")
  }

  sock.ev.on("creds.update", saveCreds)

  sock.ev.on("connection.update", (update) => {
    const { connection, lastDisconnect } = update
    if (connection === "close") {
      if (
        lastDisconnect.error?.output?.statusCode !== DisconnectReason.loggedOut
      ) {
        startBot()
      }
    } else if (connection === "open") {
      console.log("✅ Shizuka Bot connected")
    }
  })

  let users = loadUsers()

  sock.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0]
    if (!m.message || m.key.fromMe) return
    const sender = m.key.remoteJid
    const body =
      m.message.conversation || m.message.extendedTextMessage?.text || ""

    if (!users[sender]) users[sender] = { registered: false }

    const user = users[sender]
    const lang = user.lang || "en"
    const text = LANGUAGES[lang]

    if (body.startsWith(".register")) {
      await sock.sendMessage(sender, { text: text.registration }, { quoted: m })
      user.awaitingLang = true
    } else if (user.awaitingLang && ["1", "2", "3", "4"].includes(body.trim())) {
      const langs = ["en", "id", "ru", "pt"]
      user.lang = langs[parseInt(body.trim()) - 1]
      user.registered = true
      user.awaitingLang = false
      await sock.sendMessage(sender, { text: LANGUAGES[user.lang].registered })
    } else {
      if (!user.registered) {
        await sock.sendMessage(sender, { text: text.needRegister })
        return
      }
      if (body.startsWith(".menu")) {
        await sock.sendMessage(sender, { text: text.menu })
      } else if (body.startsWith(".ping")) {
        await sock.sendMessage(sender, { text: text.ping })
      } else if (body.startsWith(".info")) {
        await sock.sendMessage(sender, { text: text.info })
      } else if (body.startsWith(".set")) {
        const [, field, value] = body.split(" ")
        if (["name", "age", "gender"].includes(field)) {
          user[field] = value
          await sock.sendMessage(sender, {
            text: `✅ ${field} updated: ${value}`,
          })
        } else {
          await sock.sendMessage(sender, {
            text: "⚠️ Use: .set name/age/gender <value>",
          })
        }
      }
    }
    saveUsers(users)
  })
}

startBot()