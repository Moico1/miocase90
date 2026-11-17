insert into public.categories (name)
values
  ('Ropa y calzado'),
  ('Electrónica y celulares'),
  ('Hogar y muebles'),
  ('Vehículos y repuestos'),
  ('Motos y bicicletas'),
  ('Comida y bebidas'),
  ('Servicios'),
  ('Herramientas y construcción'),
  ('Deportes y juegos'),
  ('Otros')
on conflict (name) do nothing;
