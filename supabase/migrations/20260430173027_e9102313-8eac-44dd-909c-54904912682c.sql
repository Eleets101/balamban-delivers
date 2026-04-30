DO $$
DECLARE
  rid uuid;
  cat_breakfast uuid;
  cat_best uuid;
  cat_new uuid;
  cat_other uuid;
  cat_kiddie uuid;
  cat_house uuid;
  cat_drinks uuid;
  cat_addons uuid;
BEGIN
  INSERT INTO public.restaurants (
    name, slug, category, description, address,
    phone, open_hours, is_open, is_active,
    base_delivery_fee, per_km_fee, free_distance_km,
    estimated_minutes, rating, sort_order
  ) VALUES (
    'Alberto''s Pizza', 'albertos-pizza', 'fast_food',
    'A taste you''ll surely miss. Pizzas, breakfast meals, pasta, shakes & more — available the whole day.',
    'Balamban, Cebu',
    NULL, '8:00 AM – 9:00 PM', true, true,
    30, 7, 2, 35, 4.7, 20
  ) RETURNING id INTO rid;

  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Breakfast Meals', 1) RETURNING id INTO cat_breakfast;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Pizza — Bestsellers', 2) RETURNING id INTO cat_best;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Pizza — New Flavors', 3) RETURNING id INTO cat_new;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Pizza — Other Flavors', 4) RETURNING id INTO cat_other;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Pizza — Kiddie''s Favorites', 5) RETURNING id INTO cat_kiddie;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'House Specialties', 6) RETURNING id INTO cat_house;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Drinks & Desserts', 7) RETURNING id INTO cat_drinks;
  INSERT INTO public.menu_categories (restaurant_id, name, sort_order) VALUES (rid, 'Add-ons', 8) RETURNING id INTO cat_addons;

  -- Breakfast Meals (served with rice, egg, cucumber slices; +₱7 for take-out/delivery already in delivery fee)
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_breakfast, 'Chicken Hotdog Breakfast', 'With rice, egg, cucumber slices', 50, 1),
    (rid, cat_breakfast, 'Hotdog Breakfast', 'With rice, egg, cucumber slices', 60, 2),
    (rid, cat_breakfast, 'Ham Breakfast', 'With rice, egg, cucumber slices', 70, 3),
    (rid, cat_breakfast, 'Hamonado Breakfast', 'With rice, egg, cucumber slices', 80, 4),
    (rid, cat_breakfast, 'Tuna Flakes Breakfast', 'With rice, egg, cucumber slices', 85, 5),
    (rid, cat_breakfast, 'Chorizo de Cebu Breakfast', 'With rice, egg, cucumber slices', 85, 6),
    (rid, cat_breakfast, 'Ham Sausage Breakfast', 'With rice, egg, cucumber slices', 90, 7),
    (rid, cat_breakfast, 'Corned Beef Breakfast', 'With rice, egg, cucumber slices', 95, 8),
    (rid, cat_breakfast, 'Hungarian Sausage Breakfast', 'With rice, egg, cucumber slices', 120, 9),
    (rid, cat_breakfast, 'Cheese Krainer Breakfast', 'With rice, egg, cucumber slices', 130, 10),
    (rid, cat_breakfast, 'Spanish Sardines Breakfast', 'With rice, egg, cucumber slices', 140, 11),
    (rid, cat_breakfast, 'Spam Breakfast', 'With rice, egg, cucumber slices', 140, 12);

  -- Bestsellers (9" QM price; bigger sizes available — call for 11")
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_best, 'Pizza Supreme (9")', 'Pork pepperoni, bacon, mushroom, onions, pineapple, black olives, green bell pepper. 11" available ₱195', 145, 1),
    (rid, cat_best, 'Hawaiian (9")', 'Ham, bacon, pineapple, mushroom, onions, green bell pepper. 11" ₱195', 145, 2),
    (rid, cat_best, 'Aloha (9")', 'Ham sausage, ham, mushroom, green bell pepper. 11" ₱200', 150, 3),
    (rid, cat_best, 'Beef & Mushroom (9")', 'Ground beef, mushroom, red bell pepper, onions. 11" ₱220', 170, 4),
    (rid, cat_best, 'All Pepperoni (9")', 'Pork pepperoni with AP hot sauce. 11" ₱250', 190, 5),
    (rid, cat_best, 'Loaded Hawaiian (9")', '11" ₱260', 240, 6),
    (rid, cat_best, 'Meaty Royale (9")', 'Hungarian sausage, pork pepperoni, salami, ham, bacon & mozzarella. 11" ₱290', 270, 7),
    (rid, cat_best, 'Alberto''s Full House (9")', 'Ham, salami, hungarian sausage, bacon, pork pepperoni, chicken hotdog, ground beef, chicken minced, mushroom, pineapple, olives, onions, tomatoes, red & green bell pepper. 11" ₱300', 280, 8),
    (rid, cat_best, 'Creamy Cucumber Spinach (9")', 'Cream cheese mix, spinach, cucumber, garlic bits. 11" ₱340', 320, 9);

  -- New Flavors
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_new, 'Spicy Meatzza (9")', '11" ₱245', 225, 1),
    (rid, cat_new, 'Pizza Tropicana (9")', 'Chorizo de Cebu, ham, spam, pineapple tidbits. 11" ₱280', 260, 2);

  -- Other Flavors
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_other, 'Garden Express (9")', 'Mushroom, pineapple, black olives, onions, tomatoes, red & green bell pepper. 11" ₱175', 125, 1),
    (rid, cat_other, 'Vegetarian (9")', 'Cucumber, lettuce, tomatoes, mushroom, onions, black olives, red & green bell pepper. 11" ₱175', 155, 2),
    (rid, cat_other, 'All Hungarian (9")', 'Hungarian sausage with AP hot sauce. 11" ₱210', 160, 3),
    (rid, cat_other, 'Beef Pepperoni (9")', '11" ₱210', 160, 4),
    (rid, cat_other, 'Pizza Burger (9")', 'Bacon, ground beef, mushroom, tomatoes & onions. 11" ₱215', 165, 5),
    (rid, cat_other, 'Chicken Garlic (9")', 'Chicken hotdog, chicken minced, tomatoes & onions. 11" ₱220', 170, 6),
    (rid, cat_other, 'Bacon Mushroom (9")', '11" ₱230', 170, 7),
    (rid, cat_other, 'Tuna Garlic (9")', 'Tuna flakes, tomatoes & onions. 11" ₱230', 180, 8),
    (rid, cat_other, 'Three of a Kind (9")', 'Ground beef, chicken minced & tuna flakes. 11" ₱255', 185, 9),
    (rid, cat_other, 'Cheesy Krainer (9")', '11" ₱270', 200, 10),
    (rid, cat_other, 'Meatlovers Deluxe (9")', 'Ham, salami, hungarian sausage, pork pepperoni, beef pepperoni, bacon, ground beef, onions, red & green bell pepper. 11" ₱260', 210, 11),
    (rid, cat_other, 'Spinach n'' Chicken Pizza (9")', 'Chicken minced, spinach, garlic bits & AP spinach white sauce', 220, 12),
    (rid, cat_other, 'Loaded Pepperoni (9")', 'Beef pepperoni, pork pepperoni & mozzarella. 11" ₱305', 285, 13);

  -- Kiddie's Favorites
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_kiddie, 'Cookies n'' Cheese (9")', 'Crushed Oreo cookies. 11" ₱150', 110, 1),
    (rid, cat_kiddie, 'Creamy Cheese (9")', 'Cream cheese mix. 11" ₱155', 115, 2),
    (rid, cat_kiddie, 'Oreo Piña (9")', '11" ₱155', 115, 3),
    (rid, cat_kiddie, 'Yummy Hotdog (9")', 'All hotdog. 11" ₱185', 135, 4),
    (rid, cat_kiddie, 'Ham Delight (9")', 'All ham. 11" ₱190', 140, 5),
    (rid, cat_kiddie, 'Chocomallow (9")', 'Choco stick, crushed Oreo, marshmallow & choco syrup. 11" ₱240', 170, 6),
    (rid, cat_kiddie, 'Ham & Egg (9")', 'Ham, ham sausage, hamonado, egg, tomatoes & onions. 11" ₱230', 180, 7),
    (rid, cat_kiddie, 'Chizzo Trio (9")', 'Quickmelt, mozzarella & cheddar cheese', 150, 8),
    (rid, cat_kiddie, 'Mango Graham (9")', 'Cream cheese, mango & crushed graham. 11" ₱240', 220, 9);

  -- House Specialties
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_house, 'Chogburizo (9")', 'Chorizo de Cebu, ham sausage & onions. 11" ₱245', 175, 1),
    (rid, cat_house, 'Buffalo Chicken (9")', 'Chicken minced, pineapple, onions, red bell pepper & AP buffalo sauce. 11" ₱250', 180, 2),
    (rid, cat_house, 'Beef Shawarma (9")', 'Ground beef, cucumber, lettuce, tomatoes, onions & AP shawarma sauce. 11" ₱275', 205, 3),
    (rid, cat_house, 'Shrimp and Mushroom (9")', 'Shrimp, mushroom, red bell pepper, tomatoes, onions & garlic bits. 11" ₱250', 230, 4),
    (rid, cat_house, 'Sisig Twist (9")', 'Pork sisig, onions, red bell pepper, garlic bits, calamansi & AP sisig sauce. 11" ₱260', 240, 5),
    (rid, cat_house, 'Royal Rumble (9")', 'Beef pepperoni, ham, salami, hungarian sausage, cheese krainer, pork pepperoni, hotdog, chicken hotdog, hamonado, shrimp, chicken minced, crab stick, cucumber, onions, pineapple, black olives, mushroom & AP rumble sauce. 11" ₱280', 260, 6),
    (rid, cat_house, 'Spanish Sardines (9")', 'Spanish sardines, capers, pickles, tomatoes & onions. 11" ₱280', 260, 7),
    (rid, cat_house, 'Anchovyp Pizza (9")', 'Anchovies, beef pepperoni, black olives, red bell pepper, tomatoes, onions & garlic bits. 11" ₱285', 265, 8),
    (rid, cat_house, 'Mango Bacon (9")', 'Cream cheese, mango, bacon & green bell pepper. 11" ₱285', 265, 9),
    (rid, cat_house, 'Salad Pizza (9")', 'Crab stick, cucumber, cucumber, onions, tomatoes, black olives, cheddar cheese, garlic bits, lettuce, boiled eggs & AP salad dressing. 11" ₱315', 295, 10),
    (rid, cat_house, 'Surf and Turf (9")', 'Shrimp, mushroom, ground beef, garlic bits & AP buffalo sauce. 11" ₱330', 310, 11),
    (rid, cat_house, 'Pizza D'' Marina (9")', 'Spanish sardines, tuna flakes, crab stick, anchovies, shrimp, carrots, pickles, tomatoes & onions. 11" ₱380', 360, 12),
    (rid, cat_house, 'Royal Flush (9")', 'Cheese krainer, pork pepperoni, hungarian sausage, ham sausage, hotdog, chicken hotdog, hamonado, ground beef, chicken minced, tuna flakes, ham, chorizo de Cebu, bacon, salami & cheddar cheese', 325, 13);

  -- Drinks & Desserts
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_drinks, 'Spaghetti (Dine-in)', NULL, 60, 1),
    (rid, cat_drinks, 'Spaghetti (Delivery/Take-out)', NULL, 67, 2),
    (rid, cat_drinks, 'Milk Shakes (Regular)', NULL, 75, 3),
    (rid, cat_drinks, 'Oreo / Choco / Mocha / Ube / Macapuno Shake', NULL, 70, 4),
    (rid, cat_drinks, 'Mango Shake', NULL, 85, 5),
    (rid, cat_drinks, 'Mango Graham Shake', NULL, 95, 6),
    (rid, cat_drinks, 'Halo-Halo Espesyal', NULL, 95, 7),
    (rid, cat_drinks, 'Ice Cream Sundae', NULL, 120, 8),
    (rid, cat_drinks, 'Milk Tea with Coco Jelly', 'Classic, Wintermelon, Taro, Okinawa, Hokkaido', 85, 9),
    (rid, cat_drinks, 'Iced Black Coffee', NULL, 50, 10),
    (rid, cat_drinks, 'Iced Caramel Macchiato / Caramel Latte', NULL, 75, 11),
    (rid, cat_drinks, 'Iced Mocha / Choco', NULL, 65, 12),
    (rid, cat_drinks, 'Hot Black Coffee', NULL, 30, 13),
    (rid, cat_drinks, 'Hot Choco / Mocha', NULL, 50, 14),
    (rid, cat_drinks, 'Cucumber/Blue Lemonade Juice (Bottle)', NULL, 45, 15),
    (rid, cat_drinks, 'Cucumber/Blue Lemonade Juice (Pitcher)', NULL, 80, 16);

  -- Add-ons (breakfast)
  INSERT INTO public.menu_items (restaurant_id, category_id, name, description, price, sort_order) VALUES
    (rid, cat_addons, 'Plain Rice', NULL, 20, 1),
    (rid, cat_addons, 'Extra Egg', NULL, 20, 2),
    (rid, cat_addons, 'Add Hot Coffee', NULL, 20, 3),
    (rid, cat_addons, 'Add Hot Choco / Mocha', NULL, 30, 4);
END $$;