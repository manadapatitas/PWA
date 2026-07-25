// Footer compartido por todas las páginas del sitio público.
// Se inyecta en un <div id="footer-placeholder"></div> que cada página debe incluir.
document.addEventListener('DOMContentLoaded', () => {
  const destino = document.getElementById('footer-placeholder');
  if (!destino) return;

  destino.innerHTML = `
    <footer>
      <div class="contenedor">
        <div class="footer-grid">
          <div>
            <h4>🐾 Manada Patitas</h4>
            <p style="opacity:0.85; font-size:0.9rem; max-width:36ch;">
              Clínica veterinaria, peluquería y petshop. Atención en local, a domicilio y tienda online.
            </p>
          </div>
          <div>
            <h4>Navegación</h4>
            <ul>
              <li><a href="index.html">Inicio</a></li>
              <li><a href="tienda.html">Tienda</a></li>
              <li><a href="agenda.html">Agendar hora</a></li>
              <li><a href="nosotros.html">Nosotros</a></li>
              <li><a href="blog.html">Consejos</a></li>
            </ul>
          </div>
          <div>
            <h4>Contacto</h4>
            <ul>
              <li>📍 Dirección de tu local aquí</li>
              <li>📞 +56 9 XXXX XXXX</li>
              <li>✉️ contacto@manadapatitas.cl</li>
              <li>🕐 Lun a Sáb, 9:00–18:00</li>
            </ul>
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${new Date().getFullYear()} Manada Patitas. Todos los derechos reservados.</span>
          <span>Pagos procesados de forma segura por Webpay (Transbank)</span>
        </div>
      </div>
    </footer>
  `;
});
