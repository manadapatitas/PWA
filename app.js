// URL de tu Web App desplegada en Google Apps Script
const URL_WEB_APP = "https://script.google.com/macros/s/AKfycby5LdWif3Eum4dAAyuqBHUON3C17OW4SLbeRxoutLyYneHcFGfQ_Q4OqwoGBCRESrcF/exec"; 

let listaCitasGlobal = [];
let listaPacientesGlobal = [];

document.addEventListener('DOMContentLoaded', () => {
  inicializarApp();
});

async function inicializarApp() {
  await cargarDatosIniciales();
  configurarEventosUI();
}

async function cargarDatosIniciales() {
  try {
    const response = await fetch(URL_WEB_APP, {
      method: "POST",
      body: JSON.stringify({ accion: "obtenerCitas" })
    });
    const resultado = await response.json();
    if (resultado.status === "success") {
      listaCitasGlobal = resultado.citas;
    }
  } catch (error) {
    console.error("Error al cargar citas:", error);
  }

  try {
    const response = await fetch(URL_WEB_APP, {
      method: "POST",
      body: JSON.stringify({ accion: "obtenerPacientes" })
    });
    const resultado = await response.json();
    if (resultado.status === "success") {
      listaPacientesGlobal = resultado.pacientes;
      poblarSelectoresTutors();
    }
  } catch (error) {
    console.error("Error al cargar pacientes:", error);
  }

  inicializarFiltroFecha();
  renderizarParrillaAgenda();
}

function inicializarFiltroFecha() {
  const inputFecha = document.getElementById('filtro-fecha-agenda');
  if (inputFecha) {
    if (!inputFecha.value) {
      const hoy = new Date().toISOString().split('T')[0];
      inputFecha.value = hoy;
    }
    inputFecha.onchange = () => renderizarParrillaAgenda();
  }
}

function normalizarFechaHoraCita(rawStr) {
  if (!rawStr) return "";
  
  if (rawStr instanceof Date) {
    const yyyy = rawStr.getFullYear();
    const mm = String(rawStr.getMonth() + 1).padStart(2, '0');
    const dd = String(rawStr.getDate()).padStart(2, '0');
    const hh = String(rawStr.getHours()).padStart(2, '0');
    const min = String(rawStr.getMinutes()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
  }

  let s = rawStr.toString().trim();
  
  if (s.includes('T')) {
    const partes = s.split('T');
    const fecha = partes[0];
    const hora = partes[1] ? partes[1].substring(0, 5) : "00:00";
    return `${fecha} ${hora}`;
  }
  
  return s.substring(0, 16);
}

function renderizarParrillaAgenda() {
  const contenedor = document.getElementById('grid-horarios');
  const fechaSeleccionada = document.getElementById('filtro-fecha-agenda') ? document.getElementById('filtro-fecha-agenda').value : '';
  if (!contenedor || !fechaSeleccionada) return;

  contenedor.innerHTML = '';
  const horasJornada = ["09:00", "09:30", "10:00", "10:30", "11:00", "11:30", "12:00", "12:30", "13:00", "13:30", "15:00", "15:30", "16:00", "16:30", "17:00", "17:30", "18:00"];

  const ahora = new Date();
  const fechaHoyStr = ahora.toISOString().split('T')[0];
  const horaActualStr = ahora.toTimeString().substring(0, 5);

  horasJornada.forEach(hora => {
    const claveBloque = `${fechaSeleccionada} ${hora}`;
    
    const cita = listaCitasGlobal.find(c => {
      const rawFechaCita = c.fecha_hora || c.Fecha_Hora || c.fecha || c.Fecha || '';
      return normalizarFechaHoraCita(rawFechaCita) === claveBloque;
    });

    const div = document.createElement('div');
    const esPasado = (fechaSeleccionada === fechaHoyStr && hora < horaActualStr);

    if (cita) {
      div.className = 'bloque-hora ocupado';
      const nomMascota = cita.mascota || cita.Mascota || 'Reservado';
      const nomServicio = cita.servicio || cita.Servicio || 'Atención';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita"><strong>🐾 ${nomMascota}</strong><br><small>${nomServicio}</small></div>`;
    } else if (esPasado) {
      div.className = 'bloque-hora pasado';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita">⛔ Pasado</div>`;
    } else {
      div.className = 'bloque-hora disponible';
      div.innerHTML = `<div class="hora-titulo">🕒 ${hora}</div><div class="info-cita">🟢 Disponible</div>`;
      div.onclick = () => seleccionarHorarioDisponible(fechaSeleccionada, hora);
    }
    contenedor.appendChild(div);
  });
}

function seleccionarHorarioDisponible(fecha, hora) {
  const inputFechaHora = document.getElementById('input-fecha-hora-seleccionada');
  if (inputFechaHora) {
    inputFechaHora.value = `${fecha} ${hora}`;
  }
  alert(`Horario seleccionado: ${fecha} ${hora}`);
}

function poblarSelectoresTutors() {
  // Lógica para poblar selectores de tutores si aplica en tu interfaz
}

function configurarEventosUI() {
  const btnReservar = document.getElementById('btn-reservar-cita');
  if (btnReservar) {
    btnReservar.onclick = async () => {
      const fechaHoraVal = document.getElementById('input-fecha-hora-seleccionada').value;
      const tutorVal = document.getElementById('select-tutor').value;
      const mascotaVal = document.getElementById('select-mascota').value;
      const servicioVal = document.getElementById('select-servicio').value;

      if (!fechaHoraVal) {
        alert("Por favor selecciona un horario de la parrilla.");
        return;
      }

      const datosCita = {
        accion: "guardarCita",
        fecha: fechaHoraVal,
        tutor: tutorVal,
        mascota: mascotaVal,
        servicio: servicioVal
      };

      btnReservar.disabled = true;
      try {
        const response = await fetch(URL_WEB_APP, {
          method: "POST",
          body: JSON.stringify(datosCita)
        });
        const res = await response.json();
        alert(res.message);
        if (res.status === "success") {
          location.reload(); // Recarga para actualizar los bloques ocupados
        }
      } catch (e) {
        alert("Error de conexión al guardar la cita.");
      } finally {
        btnReservar.disabled = false;
      }
    };
  }
}