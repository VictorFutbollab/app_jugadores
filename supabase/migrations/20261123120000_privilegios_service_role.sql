-- ════════════════════════════════════════════════════════════════════════
-- Privilegios explícitos para service_role (procesos de servidor).
--
-- Los proyectos nuevos de Supabase ya no conceden privilegios por defecto sobre
-- las tablas creadas en public. La migración anterior los daba explícitamente a
-- authenticated, pero no a service_role, que es la clave que solo usan procesos
-- de servidor (pruebas automáticas, tareas de mantenimiento). Nunca va en la app.
--
-- service_role ya ignora RLS; aquí solo recibe las operaciones que necesita.
-- El registro de actividad sigue siendo inmutable también para él: solo lectura.
-- ════════════════════════════════════════════════════════════════════════

grant usage on schema public to service_role;

do $$
declare t text;
begin
  foreach t in array array['profiles', 'equipos', 'miembros', 'jugadores', 'eventos', 'items', 'estados', 'evaluaciones', 'pruebas', 'asistencias', 'participaciones', 'cargas', 'notas'] loop
    execute format('grant select, insert, update, delete on public.%I to service_role', t);
  end loop;
end $$;

grant select on public.registro_actividad to service_role;
