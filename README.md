# 🦌 Pudú Mail 2 - Attachment Explorer & Disk Mover

**Pudú Mail 2** es una herramienta web moderna y privada diseñada para explorar, ordenar por tamaño (KB/MB/GB), previsualizar y respaldar los archivos adjuntos de Gmail directamente en el disco duro del usuario.

## ✨ Características Principales

- ⚡ **Ordenamiento por tamaño exacto:** Encuentra al instante los archivos más pesados que están consumiendo tu almacenamiento de Google Drive/Gmail.
- 💾 **Mover a mi disco (File System Access API):** Guarda múltiples adjuntos directamente en cualquier carpeta seleccionada de tu PC en 1 clic.
- 👁️ **Vista previa interactiva:** Abre y visualiza PDFs, imágenes, videos y documentos sin salir de la aplicación.
- 🧩 **Conector de 1 Clic (Extensión de Chrome Manifest V3):** Sin barreras de verificación OAuth restringidas ni auditorías CASA de Google.
- 📥 **Modo Drag & Drop Local:** Soporte para archivos `.mbox` y `.eml` de Google Takeout sin requerir ninguna extensión.
- 💰 **Monetización lista:** Espacios optimizados para anuncios de Google AdSense o patrocinadores.

## Privacidad del conector

La extensión sólo lee la interfaz ya abierta de Gmail y resuelve la descarga del adjunto cuando la persona la solicita. No usa Gmail API, Google OAuth, `client_id`, tokens ni un servidor que almacene correo. Las URLs de descarga son temporales y no se guardan; los metadatos se conservan sólo en el navegador para volver a resolverlos al descargar.

---

## 🚀 Estructura del Proyecto

```
pudumail2/
├── assets/                  # Imágenes y mascotas oficiales
├── extension/               # Extensión de Chrome Manifest V3 (Conector 1-Clic)
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html
│   ├── popup.js
│   └── icons/
├── js/
│   ├── app.js               # Controlador principal del explorador
│   ├── extension_bridge.js  # Puente de comunicación Web <-> Extensión
│   ├── formats.js           # Formateadores de bytes y fechas
│   └── mbox_parser.js       # Parser local de MBOX / EML
├── index.html               # Interfaz de usuario principal
├── style.css                # Estilos modernos con glassmorphism y modo oscuro
├── privacy.html             # Política de privacidad
├── terms.html               # Términos de servicio
└── vercel.json              # Configuración de despliegue en Vercel
```

---

## 🛠️ Cómo Probar la Extensión en Desarrollo

1. Abre tu navegador basado en Chromium (Chrome, Brave, Edge).
2. Ve a `chrome://extensions/`.
3. Activa el **"Modo de desarrollador"** (arriba a la derecha).
4. Haz clic en **"Cargar descomprimida"** y selecciona la carpeta `pudumail2/extension/`.
5. Abre `https://pudumail2.vercel.app` (o abre `index.html` localmente) y haz clic en **"Explorar Gmail"**.
