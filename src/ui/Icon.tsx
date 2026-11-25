const P = {
  inicio: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5.5v-6h-5v6H4a1 1 0 0 1-1-1z',
  plantilla: 'M4 4h6.5v6.5H4zM13.5 4H20v6.5h-6.5zM4 13.5h6.5V20H4zM13.5 13.5H20V20h-6.5z',
  evolucion: 'M3 17l5.5-5.5 4 4L21 7M15 7h6v6',
  perfil: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c.6-3.8 3.9-6 8-6s7.4 2.2 8 6',
  mas: 'M12 5v14M5 12h14',
  atras: 'M15 5l-7 7 7 7',
  cerrar: 'M6 6l12 12M18 6 6 18',
  estrella: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z',
  candado: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  familia: 'M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM17 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5zM2.5 20c.4-3.2 2.6-5 5.5-5s5.1 1.8 5.5 5M14 15.3c.9-.5 1.9-.8 3-.8 2.5 0 4.2 1.6 4.5 4.5',
  aviso: 'M12 4 2.8 19.5h18.4zM12 10v4.5M12 17v.01',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  camara: 'M4 8h3l1.5-2.5h7L17 8h3v11H4zM12 16.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7z',
  salir: 'M15 4h4v16h-4M10 8l-4 4 4 4M6 12h10',
  reloj: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  buscar: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.8-4.8',
  escudo: 'M12 3l7.5 3v5.5c0 4.5-3.2 8-7.5 9.5-4.3-1.5-7.5-5-7.5-9.5V6z',
  ojo: 'M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  descargar: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  papelera: 'M4.5 7h15M9.5 7V4.5h5V7M6.5 7l1 13h9l1-13',
  lapiz: 'M4 20l1-4.5L15.5 5a2.1 2.1 0 0 1 3 3L8 18.5zM13.5 7l3 3',
} as const

export type NombreIcono = keyof typeof P

export function Icon({ n, size = 20, relleno = false, className }: { n: NombreIcono; size?: number; relleno?: boolean; className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill={relleno ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={className}
    >
      <path d={P[n]} />
    </svg>
  )
}
