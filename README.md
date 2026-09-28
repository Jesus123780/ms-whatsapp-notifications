# IL SALONE - WhatsApp Local Sender

Aplicación local en Node.js + TypeScript para envíos controlados de mensajes de WhatsApp utilizando WhatsApp Web.

## Requisitos

- Node.js >= 18.0.0
- npm >= 9.0.0
- Google Chrome o Chromium (para Puppeteer)

## Instalación

```bash
npm install
```

## Configuración

1. Copiar el archivo de configuración:

```bash
cp .env.example .env
```

2. Colocar el archivo Excel en la raíz:

```
base_de_datos_clientes.xlsx
```

3. Colocar la imagen de campaña en `assets/`:

```
assets/il-salone-sorteo.png
```

## Comandos

### Login (iniciar sesión en WhatsApp)

```bash
npm run whatsapp:login
```

Escanea el código QR que aparece en consola. La sesión se guardará localmente.

### Envío de prueba (SOLO a Odalis)

```bash
npm run send:test
```

Envía únicamente al contacto de prueba configurado en `.env`:
- TEST_NAME=Odalis
- TEST_PHONE=573024585004

Requiere escribir `ENVIAR` para confirmar.

### Envío masivo

1. Activar en `.env`:

```
ENABLE_BULK_SEND=true
```

2. Ejecutar:

```bash
npm run send:bulk
```

Requiere escribir `CONFIRMAR` para iniciar.

### Otros comandos

| Comando | Descripción |
|---------|-------------|
| `npm run build` | Compilar TypeScript |
| `npm run lint` | Ejecutar linter |
| `npm run test` | Ejecutar tests |
| `npm run test:watch` | Tests en modo watch |
| `npm run dev` | Iniciar en modo desarrollo |
| `npm run start:server` | Iniciar servidor HTTP + WhatsApp |

## Servidor HTTP (QR para React)

El servidor HTTP expone el QR de autenticación para que tu app de React pueda renderizarlo.

### Iniciar el servidor

```bash
npm run start:server
```

Esto levanta:
1. Un servidor Express en `http://localhost:3001`
2. El cliente WhatsApp (genera QR si no hay sesión activa)

El QR se muestra en terminal Y se expone via HTTP.

### Endpoints

#### `GET /api/qr`

Retorna el código QR actual para autenticación.

```json
// QR disponible (esperando escaneo)
{
  "status": "qr_pending",
  "qr": "2@ABC123...xyz"
}

// Ya autenticado
{
  "status": "ready",
  "qr": null,
  "message": "Ya autenticado, no se requiere QR"
}

// Inicializando (QR aún no generado)
{
  "status": "connecting",
  "qr": null,
  "message": "QR no disponible aún"
}
```

#### `GET /api/status`

Retorna el estado actual del cliente WhatsApp.

```json
{
  "status": "ready"
}
```

Estados posibles: `disconnected`, `connecting`, `qr_pending`, `authenticated`, `ready`

#### `POST /api/send`

Envia un mensaje de texto a un solo numero.

Request:
```bash
curl -X POST http://localhost:3001/api/send \
  -H "Content-Type: application/json" \
  -d '{"phone": "3001234567", "message": "Hola, este es un mensaje de prueba"}'
```

Body (JSON):
```json
{
  "phone": "3001234567",
  "message": "Hola, tu cita es manana a las 3pm"
}
```

Respuestas:
```json
// 200 - Exitoso
{ "success": true, "phone": "+573001234567", "message": "Mensaje enviado" }

// 400 - Campos faltantes o numero invalido
{ "error": "Se requieren los campos: phone, message" }
{ "error": "Número de teléfono inválido: debe tener 12 dígitos..." }

// 404 - Numero no registrado en WhatsApp
{ "error": "Número no registrado en WhatsApp", "phone": "+573001234567" }

// 503 - WhatsApp no conectado
{ "error": "WhatsApp no está conectado" }
```

#### `POST /api/campaign`

Sube un archivo CSV o Excel con contactos y envia un mensaje a todos en batches. El procesamiento es asincronico (responde inmediatamente y procesa en background).

Request:
```bash
curl -X POST http://localhost:3001/api/campaign \
  -F "file=@contactos.csv" \
  -F "message=Hola, te invitamos al sorteo de Il Salone!"
```

Campos del formulario (multipart/form-data):
- `file` (requerido): archivo CSV o Excel (.csv, .xlsx, .xls)
- `message` (requerido): texto del mensaje a enviar

Columnas aceptadas en el archivo (autodeteccion):
- Numero: `number`, `phone`, `telefono`, `Number`, `contact_number`
- Nombre: `name`, `nombre`, `contact_name`, `Name` (opcional)

Respuestas:
```json
// 202 - Campaña creada y procesando
{
  "success": true,
  "campaignId": 5,
  "campaignName": "campaign-1723154400000",
  "totalContacts": 445,
  "message": "Campaña creada. Procesando en background. Monitorea por WebSocket."
}

// 400 - Error de validacion
{ "error": "Se requiere el campo: message" }
{ "error": "Se requiere un archivo CSV o Excel (campo: file)" }
{ "error": "El archivo no contiene contactos válidos" }

// 409 - Campaña ya en ejecucion
{ "error": "Ya hay una campaña en ejecución" }

// 503 - WhatsApp no conectado
{ "error": "WhatsApp no está conectado" }
```

Progreso via WebSocket:
```json
// Inicio
{ "event": "campaign:start", "campaignId": 5, "total": 25 }

// Progreso por contacto
{ "event": "campaign:progress", "campaignId": 5, "index": 1, "total": 25, "name": "Adrian Ortiz", "status": "sent" }
{ "event": "campaign:progress", "campaignId": 5, "index": 2, "total": 25, "name": "Samuel Bowie", "status": "not_registered" }
{ "event": "campaign:progress", "campaignId": 5, "index": 3, "total": 25, "name": "Keider Castro", "status": "failed" }
{ "event": "campaign:progress", "campaignId": 5, "index": 4, "total": 25, "name": "Rosmel Galvis", "status": "skipped" }
{ "event": "campaign:progress", "campaignId": 5, "index": 5, "total": 25, "name": "Numero Malo", "status": "invalid_phone" }

// Finalizado
{ "event": "campaign:complete", "campaignId": 5, "result": { "total": 25, "sent": 20, "failed": 2, "notRegistered": 2, "skipped": 1 } }

// Error durante envio
{ "event": "campaign:error", "campaignId": 5, "message": "WhatsApp desconectado durante el envío" }
```

Comportamiento de la campaña:
- Solo una campaña activa a la vez (409 si intentas otra)
- Respeta `MAX_MESSAGES_PER_RUN` del `.env`
- Respeta `MIN_DELAY_BETWEEN_MESSAGES_MS` y `MAX_DELAY_BETWEEN_MESSAGES_MS`
- Idempotencia: no reenvia a numeros ya marcados como SENT en la misma campaña
- Persiste cada job en SQLite (resistente a crashes)
- Limpia el archivo subido al terminar

Ejemplo de archivo CSV:
```csv
name,number
Adrian Ortiz,3001234567
Samuel Bowie,3109876543
Keider Castro,573201112233
```

Ejemplo React para monitorear campaña:
```tsx
useEffect(() => {
  const ws = new WebSocket('ws://localhost:3001');

  ws.onmessage = (event) => {
    const data = JSON.parse(event.data);

    if (data.event === 'campaign:start') {
      setTotal(data.total);
      setProcessing(true);
    }
    if (data.event === 'campaign:progress') {
      setProgress(data.index);
      addLog(`[${data.index}/${data.total}] ${data.name}: ${data.status}`);
    }
    if (data.event === 'campaign:complete') {
      setResult(data.result);
      setProcessing(false);
    }
  };

  return () => ws.close();
}, []);
```

### Integración con React

1. Instalar la librería de QR:

```bash
npm install qrcode.react
```

2. Componente de ejemplo:

```tsx
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function WhatsAppQR() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const res = await fetch('http://localhost:3001/api/qr');
        const data = await res.json();
        setStatus(data.status);

        if (data.qr) {
          setQrCode(data.qr);
        }
        if (data.status === 'ready') {
          setQrCode(null);
          clearInterval(interval);
        }
      } catch {
        // servidor no disponible
      }
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  if (status === 'ready') return <p>WhatsApp conectado</p>;
  if (!qrCode) return <p>Esperando QR...</p>;

  return <QRCodeSVG value={qrCode} size={256} />;
}
```

### Configuración CORS

Por defecto acepta requests desde `http://localhost:3000`. Para cambiar:

```env
CORS_ORIGIN=http://localhost:5173
```

### WebSocket (notificaciones en tiempo real)

Ademas de los endpoints REST, el servidor expone un WebSocket en `ws://localhost:3001` que notifica cambios de estado al instante (sin necesidad de polling).

Eventos que recibe el cliente:

```json
// Cambio de estado
{ "event": "status", "status": "disconnected", "qr": null }
{ "event": "status", "status": "qr_pending", "qr": "2@ABC..." }
{ "event": "status", "status": "ready", "qr": null }

// Nuevo QR generado
{ "event": "qr", "qr": "2@ABC123...xyz", "status": "qr_pending" }
```

Al conectarse, el WebSocket envia inmediatamente el estado actual.

Componente React con WebSocket:

```tsx
import { useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

function WhatsAppQR() {
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [status, setStatus] = useState('connecting');

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:3001');

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);

      if (data.status) setStatus(data.status);
      if (data.event === 'qr' && data.qr) setQrCode(data.qr);
      if (data.status === 'ready') setQrCode(null);
      if (data.status === 'disconnected') setQrCode(null);
    };

    ws.onclose = () => {
      // Reconectar automaticamente
      setTimeout(() => window.location.reload(), 3000);
    };

    return () => ws.close();
  }, []);

  if (status === 'ready') return <p>WhatsApp conectado</p>;
  if (status === 'disconnected') return <p>Desconectado. Esperando reconexion...</p>;
  if (!qrCode) return <p>Esperando QR...</p>;

  return <QRCodeSVG value={qrCode} size={256} />;
}
```

### Auto-reconexion

El servidor maneja automaticamente la desconexion (LOGOUT desde celular, perdida de conexion, etc.):

1. Detecta el evento `disconnected`
2. Notifica a React via WebSocket con `status: 'disconnected'`
3. Destruye la sesion actual
4. Espera 10 segundos
5. Crea una nueva instancia y genera un nuevo QR
6. Notifica via WebSocket con el nuevo QR

No necesitas reiniciar el servidor manualmente. El proceso nunca muere.

## Cambiar el mensaje

Editar el archivo:

```
src/domain/messages/raffle-message.ts
```

## Cambiar la imagen

1. Reemplazar el archivo en `assets/`
2. Actualizar en `.env`:

```
CAMPAIGN_IMAGE_PATH=./assets/nueva-imagen.png
```

## Cambiar los delays

En `.env`:

```env
# Configuración SEGURA (anti-restricción)
MIN_DELAY_BETWEEN_MESSAGES_MS=45000
MAX_DELAY_BETWEEN_MESSAGES_MS=90000
MAX_MESSAGES_PER_RUN=25
```

### Configuraciones recomendadas

| Escenario | MAX_MESSAGES | MIN_DELAY | MAX_DELAY |
|-----------|-------------|-----------|-----------|
| Conservador (post-restricción) | 15 | 60000 (1min) | 120000 (2min) |
| Normal | 25 | 45000 (45s) | 90000 (90s) |
| Agresivo (NO recomendado) | 50 | 5000 | 10000 |

### Evitar restricciones de WhatsApp

WhatsApp detecta envío masivo si:
- Envias muchos mensajes en poco tiempo (< 5s entre mensajes)
- No hay límite de mensajes por ejecución
- El patron de envío es perfectamente regular

Recomendaciones:
1. Nunca usar delays menores a 30 segundos en produccion
2. Limitar a 20-30 mensajes por ejecucion
3. Separar ejecuciones por 2-3 horas minimo
4. Despues de una restriccion, esperar 24-48h y empezar con lotes de 10-15
5. Ir subiendo gradualmente (semana 1: 15, semana 2: 20, semana 3: 25)

## Cambiar el límite de mensajes

En `.env`:

```env
MAX_MESSAGES_PER_RUN=50
```

Valor `0` significa sin límite (requiere confirmación adicional).

## Historial de envíos

Los envíos se registran en SQLite:

```
data/whatsapp-sender.db
```

Para consultar el historial puedes usar cualquier cliente SQLite:

```bash
sqlite3 data/whatsapp-sender.db "SELECT * FROM message_jobs ORDER BY created_at DESC LIMIT 20;"
```

## Arquitectura

```
src/
├── domain/          → Entidades, Value Objects, Ports, Servicios de dominio
├── application/     → Casos de uso
├── infrastructure/  → Adaptadores (WhatsApp, SQLite, Excel, Config)
├── presentation/
│   ├── cli/         → Comandos CLI (send, test, server)
│   └── http/        → Servidor HTTP (QR endpoint para React)
└── shared/          → Errores, utilidades, constantes
```

## Seguridad

- No subir `.env` a Git
- No subir sesiones de WhatsApp a Git
- No incluir datos personales en repositorios públicos
- Los contactos deben haber dado autorización previa para recibir comunicaciones
- No implementa mecanismos para evadir controles de WhatsApp

## Variables de entorno

| Variable | Descripcion | Default |
|----------|-------------|---------|
| `WHATSAPP_CLIENT_ID` | Identificador de la sesion | `il-salone-sender` |
| `EXCEL_PATH` | Ruta al archivo Excel | `./base_de_datos_clientes.xlsx` |
| `CAMPAIGN_IMAGE_PATH` | Ruta a la imagen de campana | `./assets/il-salone-sorteo.png` |
| `ENABLE_BULK_SEND` | Habilitar envio masivo | `false` |
| `TEST_MODE` | Modo de prueba | `true` |
| `TEST_PHONE` | Telefono de prueba | `573024585004` |
| `TEST_NAME` | Nombre del contacto de prueba | `Odalis` |
| `MAX_MESSAGES_PER_RUN` | Maximo de mensajes por ejecucion | `50` |
| `MIN_DELAY_BETWEEN_MESSAGES_MS` | Delay minimo entre mensajes (ms) | `5000` |
| `MAX_DELAY_BETWEEN_MESSAGES_MS` | Delay maximo entre mensajes (ms) | `10000` |
| `SEND_MODE` | Modo de envio | `MEDIA_WITH_CAPTION` |
| `MAX_RETRIES` | Reintentos por mensaje | `2` |
| `HTTP_PORT` | Puerto del servidor HTTP | `3001` |
| `CORS_ORIGIN` | Origen permitido para CORS | `http://localhost:3000` |
