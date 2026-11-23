// app.js
// Instalabilidad + Pre-Permiso UX + control de cámara frontal/trasera.
// Sin async/await: solo .then(), .catch() y .finally().

const mensajeEstado = document.getElementById('mensaje-estado');

function actualizarMensajeEstado(texto) {
  mensajeEstado.textContent = texto;
}

// Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registro) => console.log('[App] SW registrado. Scope:', registro.scope))
      .catch((error) => console.error('[App] Error al registrar el SW:', error));
  });
}

// ---------------------------------------------------------------------------
// Fragmento B: Captura del evento de instalación
// ---------------------------------------------------------------------------
let eventoInstalacionDiferido = null;

window.addEventListener('beforeinstallprompt', (event) => {
  // Evita que el mini-banner automático aparezca antes de tiempo
  event.preventDefault();
  eventoInstalacionDiferido = event;

  // Muestra tu botón personalizado de instalación en la UI
  const btnInstalar = document.getElementById('btn-instalar');
  btnInstalar.hidden = false;
});

// Desafío 1: prompt() + userChoice.then() para ocultar el botón al aceptar
document.getElementById('btn-instalar').addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;

  eventoInstalacionDiferido.prompt();
  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      if (resultado.outcome === 'accepted') {
        document.getElementById('btn-instalar').hidden = true;
      }
    })
    .finally(() => {
      eventoInstalacionDiferido = null;
    });
});

// ---------------------------------------------------------------------------
// Notas iOS: Detección de iOS y modo instalado
// ---------------------------------------------------------------------------
function verificarEntornoIOS(){
  const esIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const estaInstalada = window.navigator.standalone === true ||
                        window.matchMedia('(display-mode: standalone)').matches;

  // Si está en iPhone y aún la ve desde el navegador, mostrar instrucciones manuales
  if (esIOS && !estaInstalada) {
    const guiaIOS = document.getElementById('instrucciones-ios');
    if (guiaIOS) guiaIOS.hidden = false;
  }
}

verificarEntornoIOS();

// ---------------------------------------------------------------------------
// Fragmento C: Liberación de hardware entre cambios de cámara
// ---------------------------------------------------------------------------
let streamActual = null;
let modoCamaraActual = 'environment'; // 'environment' = trasera | 'user' = frontal

function detenerCamaraActiva(){
  if (streamActual) {
    streamActual.getTracks().forEach((track) => {
      track.stop();
    });
    streamActual = null;
  }
}

// ---------------------------------------------------------------------------
// Fragmento D: Encendido de cámara con promesas y diagnóstico de errores
// ---------------------------------------------------------------------------
function iniciarCamara(modo){
  detenerCamaraActiva();

  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  return navigator.mediaDevices.getUserMedia(restricciones)
    .then((stream) => {
      streamActual = stream;
      const visorVideo = document.getElementById('visor-camara');
      visorVideo.srcObject = stream;
      actualizarMensajeEstado(`Cámara activa (${modo === 'environment' ? 'Trasera' : 'Frontal'})`);
    })
    .catch((error) => {
      if (error.name === 'NotAllowedError') {
        actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador.');
      } else if (error.name === 'NotFoundError') {
        actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
      } else if (error.name === 'NotReadableError') {
        actualizarMensajeEstado('La cámara está en uso por otra aplicación (videollamada, app de Cámara, otra pestaña). Ciérrala y pulsa "Solicitar Acceso a Cámara" de nuevo.');
      } else {
        actualizarMensajeEstado(`Error al acceder al hardware: ${error.message}`);
      }
    });
}

// ---------------------------------------------------------------------------
// Fragmento E: Flujo de consentimiento previo (Pre-Permiso UX)
// ---------------------------------------------------------------------------
// Paso 1: El usuario pulsa "Solicitar Acceso a Cámara" -> Mostramos aviso explicativo
document.getElementById('btn-preparar-camara').addEventListener('click', () => {
  document.getElementById('aviso-permiso').hidden = false;
});

// Paso 2: El usuario lee el motivo y pulsa "Aceptar y Encender Cámara"
document.getElementById('btn-confirmar-permiso').addEventListener('click', () => {
  document.getElementById('aviso-permiso').hidden = true;
  iniciarCamara(modoCamaraActual);
});

// "Ahora no": el usuario declina sin disparar el diálogo nativo
document.getElementById('btn-cancelar-permiso').addEventListener('click', () => {
  document.getElementById('aviso-permiso').hidden = true;
  actualizarMensajeEstado('Acceso a cámara pospuesto.');
});

// ---------------------------------------------------------------------------
// Desafío 2: Alternancia de lentes y apagado
// ---------------------------------------------------------------------------
document.getElementById('btn-alternar-camara').addEventListener('click', () => {
  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  iniciarCamara(modoCamaraActual);
});

document.getElementById('btn-apagar-camara').addEventListener('click', () => {
  detenerCamaraActiva();
  const visorVideo = document.getElementById('visor-camara');
  visorVideo.srcObject = null;
  actualizarMensajeEstado('Cámara apagada.');
});
