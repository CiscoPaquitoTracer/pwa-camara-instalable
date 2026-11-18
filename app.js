// app.js
// Instalabilidad + Pre-Permiso UX + control de cámara frontal/trasera.
// JavaScript Vanilla. Sin async/await: solo .then(), .catch() y .finally().

// ---------------------------------------------------------------------------
// Referencias al DOM
// ---------------------------------------------------------------------------
const btnInstalar = document.getElementById('btn-instalar');
const btnPrepararCamara = document.getElementById('btn-preparar-camara');
const btnConfirmarPermiso = document.getElementById('btn-confirmar-permiso');
const btnCancelarPermiso = document.getElementById('btn-cancelar-permiso');
const btnAlternarCamara = document.getElementById('btn-alternar-camara');
const btnApagarCamara = document.getElementById('btn-apagar-camara');
const avisoPermiso = document.getElementById('aviso-permiso');
const visorVideo = document.getElementById('visor-camara');
const visorVacio = document.getElementById('visor-vacio');
const mensajeEstado = document.getElementById('mensaje-estado');

function actualizarMensajeEstado(texto) {
  mensajeEstado.textContent = texto;
}

// Habilita/deshabilita los controles según si hay cámara encendida
function actualizarControles(camaraEncendida) {
  btnAlternarCamara.disabled = !camaraEncendida;
  btnApagarCamara.disabled = !camaraEncendida;
  btnPrepararCamara.hidden = camaraEncendida;
  visorVacio.hidden = camaraEncendida;
  // Espejo solo para la frontal (más natural para el usuario)
  visorVideo.classList.toggle('espejo', camaraEncendida && modoCamaraActual === 'user');
}

// ---------------------------------------------------------------------------
// Registro del Service Worker
// ---------------------------------------------------------------------------
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registro) => {
        console.log('[App] SW registrado. Scope:', registro.scope);
      })
      .catch((error) => {
        console.error('[App] Error al registrar el SW:', error);
      });
  });
}

// ---------------------------------------------------------------------------
// Fragmento B: Captura del evento de instalación (Chrome / Android)
// ---------------------------------------------------------------------------
let eventoInstalacionDiferido = null;

window.addEventListener('beforeinstallprompt', (event) => {
  // Evita que el mini-banner automático aparezca antes de tiempo
  event.preventDefault();
  eventoInstalacionDiferido = event;

  // Muestra tu botón personalizado de instalación en la UI
  btnInstalar.hidden = false;
});

// Desafío 1.2: click en #btn-instalar -> prompt() -> userChoice.then(...)
btnInstalar.addEventListener('click', () => {
  if (!eventoInstalacionDiferido) return;

  eventoInstalacionDiferido.prompt();
  eventoInstalacionDiferido.userChoice
    .then((resultado) => {
      if (resultado.outcome === 'accepted') {
        console.log('[App] Instalación aceptada');
        btnInstalar.hidden = true;
      } else {
        console.log('[App] Instalación rechazada');
      }
    })
    .catch((error) => {
      console.error('[App] Error en el prompt de instalación:', error);
    })
    .finally(() => {
      // El evento diferido solo puede usarse una vez
      eventoInstalacionDiferido = null;
    });
});

// Cuando la app termina de instalarse (por nuestro botón o por el menú del navegador)
window.addEventListener('appinstalled', () => {
  btnInstalar.hidden = true;
  eventoInstalacionDiferido = null;
  console.log('[App] PWA instalada');
});

// ---------------------------------------------------------------------------
// Notas iOS: Detección de iOS y modo instalado
// ---------------------------------------------------------------------------
function verificarEntornoIOS() {
  // iPadOS 13+ se reporta como "Macintosh": lo detectamos por pantalla táctil
  const esIOS = (/iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream) ||
                (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
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

function detenerCamaraActiva() {
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
function iniciarCamara(modo) {
  detenerCamaraActiva();

  // getUserMedia solo existe en contextos seguros (HTTPS o localhost)
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    actualizarMensajeEstado('Tu navegador no permite acceder a la cámara. Abre la app desde HTTPS.');
    actualizarControles(false);
    return Promise.resolve();
  }

  const restricciones = {
    video: { facingMode: modo },
    audio: false
  };

  actualizarMensajeEstado('Encendiendo cámara...');
  btnAlternarCamara.disabled = true; // evita dobles clics mientras se abre el sensor

  return navigator.mediaDevices.getUserMedia(restricciones)
    .then((stream) => {
      streamActual = stream;
      visorVideo.srcObject = stream;
      actualizarControles(true);
      actualizarMensajeEstado(`Cámara activa (${modo === 'environment' ? 'Trasera' : 'Frontal'})`);
    })
    .catch((error) => {
      visorVideo.srcObject = null;
      actualizarControles(false);

      if (error.name === 'NotAllowedError') {
        actualizarMensajeEstado('Permiso denegado. Habilita el acceso a la cámara en los ajustes de tu navegador.');
      } else if (error.name === 'NotFoundError') {
        actualizarMensajeEstado('No se detectó el sensor de cámara solicitado en este dispositivo.');
      } else if (error.name === 'NotReadableError') {
        // El sensor existe y hay permiso, pero el sistema operativo no lo entregó:
        // otra app lo tiene abierto o el lente anterior aún no se liberaba.
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
btnPrepararCamara.addEventListener('click', () => {
  avisoPermiso.hidden = false;
  avisoPermiso.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

// Paso 2: El usuario lee el motivo y pulsa "Aceptar y Encender Cámara"
btnConfirmarPermiso.addEventListener('click', () => {
  avisoPermiso.hidden = true;
  iniciarCamara(modoCamaraActual);
});

// Alternativa: el usuario decide no continuar (no se dispara el diálogo nativo)
btnCancelarPermiso.addEventListener('click', () => {
  avisoPermiso.hidden = true;
  actualizarMensajeEstado('No se solicitó acceso a la cámara.');
});

// ---------------------------------------------------------------------------
// Desafío 2: Alternancia de lentes y apagado
// ---------------------------------------------------------------------------
btnAlternarCamara.addEventListener('click', () => {
  modoCamaraActual = modoCamaraActual === 'environment' ? 'user' : 'environment';
  iniciarCamara(modoCamaraActual); // iniciarCamara() libera el sensor anterior con track.stop()
});

btnApagarCamara.addEventListener('click', () => {
  detenerCamaraActiva();
  visorVideo.srcObject = null;
  actualizarControles(false);
  actualizarMensajeEstado('Cámara apagada. El sensor fue liberado.');
});

// Libera el sensor si el usuario sale de la página
window.addEventListener('pagehide', () => {
  detenerCamaraActiva();
});
