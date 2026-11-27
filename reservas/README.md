# Reservas AC (Almacén de Carnes)

App PWA de reservas y mapa de mesas. Dirección canónica:

https://tg-apps-bbde7.firebaseapp.com/reservas/

- Misma clave del equipo que Inventario TG. No hay datos financieros.
- v1 no está conectada a Bims ni a Google Calendar (`calendar_event_id` queda listo para después).
- Firestore: `reservas_carnes/config`, `reservas_carnes/config/mesas/{id}`, `reservas_carnes/config/reservas/{id}`.
- Las reservas no se borran; solo cambian de estado (confirmada, llegó, no se presentó, cancelada).
- El mapa de mesas (v3) sigue el POS de Bims: Salón Mayoría, Patio, Granero y Tienda. Mesa Especial no está (Tomás no la pidió). La capacidad no viene de Bims: 2 por defecto, 4 las alargadas y 6 las barras, y se edita en la app. El turno «Sábado noche» se puede cambiar en Editar salón.

Publicación: `cd /workspace/firebase-hosting && ./sync.sh && firebase deploy --only hosting --project tg-apps-bbde7`.
`sync.sh` copia todo el repo (incluida esta carpeta `reservas/`); no hace falta listarla aparte.
