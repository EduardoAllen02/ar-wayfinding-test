# Prueba AR: puntos en el suelo

Pone en el suelo los puntos que le manden, con 8th Wall en escala `responsive`
(sin calibrar el SLAM antes). Página de prueba para el móvil.

## En el móvil

1. Abre la página por HTTPS (la de GitHub Pages ya lo es).
2. Pon la altura a la que llevas el móvil y toca **Entrar**.
3. Apunta al suelo, escribe una guía (`10 adelante, 4 diag der`) y toca **Colocar**.

Guía: `N dirección` separado por comas. Direcciones: `adelante`, `diag der`,
`derecha`, `atras`, `diag izq`, `izquierda`, o un ángulo (`5 +30`). Cada tramo gira
respecto al anterior; el primero, respecto a hacia donde miras.

- **Desde mis pies / Donde apunto**: el trazado arranca bajo ti o en el anillo.
- **Suelo**: sube o baja el plano si el anillo no se pega al piso.
- **Rejilla**: cuadrícula de 1 m para ver si el plano se queda pegado al caminar.

## Parámetros de la URL

| | |
|---|---|
| `camh=1.4` | altura inicial del móvil (m) |
| `offset=0.6` | acercamiento del anillo hacia la cámara (m) |
| `color=debug` | puntos en magenta |
| `sim=sala` | espacio virtual simulado (cámara y sensores falsos, en el navegador del ordenador) |

`xr/` es el motor de 8th Wall, sin modificar, con sus avisos de licencia.
