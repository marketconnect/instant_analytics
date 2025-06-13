#!/usr/bin/env python3
import pandas as pd
from datetime import datetime, timedelta
import random

# Создаем тестовые данные для первого листа - продукты
products_data = {
    'id': range(1, 101),
    'name': [f'Product_{i}' for i in range(1, 101)],
    'category': [random.choice(['Electronics', 'Clothing', 'Books', 'Home']) for _ in range(100)],
    'price': [round(random.uniform(10, 1000), 2) for _ in range(100)],
    'in_stock': [random.choice([True, False]) for _ in range(100)],
    'created_date': [datetime.now() - timedelta(days=random.randint(0, 365)) for _ in range(100)]
}

# Создаем тестовые данные для второго листа - продажи
sales_data = {
    'sale_id': range(1, 51),
    'product_id': [random.randint(1, 100) for _ in range(50)],
    'quantity': [random.randint(1, 10) for _ in range(50)],
    'sale_date': [datetime.now() - timedelta(days=random.randint(0, 30)) for _ in range(50)],
    'customer': [f'Customer_{i}' for i in range(1, 51)]
}

# Создаем DataFrame'ы
df_products = pd.DataFrame(products_data)
df_sales = pd.DataFrame(sales_data)

# Записываем в Excel файл с несколькими листами
with pd.ExcelWriter('test-multi-sheet.xlsx', engine='openpyxl') as writer:
    df_products.to_excel(writer, sheet_name='Products', index=False)
    df_sales.to_excel(writer, sheet_name='Sales', index=False)

print("✅ Создан файл test-multi-sheet.xlsx с двумя листами:")
print(f"- Products: {len(df_products)} строк")
print(f"- Sales: {len(df_sales)} строк")

# Также создаем простой файл с одним листом
df_products.to_excel('test-simple.xlsx', index=False)
print("✅ Создан файл test-simple.xlsx с одним листом") 