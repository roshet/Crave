import requests
import json

RESTAURANT = "mcdonalds"

CATEGORY_ITEM_TYPE = {
    "burgers": "food",
    "breakfast": "food",
    "chicken_fish": "food",
    "fries_sides": "food",
    "nuggets_strips": "food",
    "snack_wraps": "food",
    
    
    "desserts": "dessert",
    "mccafe_coffees": "drink",
    "beverages": "drink",
    "sauces": "sauce",
}

CATEGORY_URLS = {
    "burgers": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=200463%28%29-200466%28%29-200476%28%29-200765%28%29-200491%28%29-200497%28%29-203410%28%29-200480%28%29-200486%28%29-200477%28%29-",
    "breakfast": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=200300%28%29-200298%28%29-200449%28%29-200161%28%29-200301%28%29-200302%28%29-200304%28%29-200306%28%29-200307%28%29-200424%28%29-201030%28%29-200145%28%29-201306%28%29-200876%28%29-200322%28%29-200323%28%29-200325%28%29-200258%28%29-200267%28%29-200340%28%29-200284%28%29-200739%28%29-200724%28%29-200731%28%29-200723%28%29-200715%28%29-200714%28%29-200717%28%29-200716%28%29-",
    "chicken_fish": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=203747%28%29-203745%28%29-203901%28%29-203873%28%29-200445%28%29-200438%28%29-",
    "fries_sides": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=200066%28%29-200068%28%29-",
    "nuggets_strips": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=200692%28%29-204386%28%29-",
    "snack_wraps": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=204401%28%29-204402%28%29-",
    
    
    "desserts": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=200101%28%29-200096%28%29-200062%28%29-200107%28%29-200108%28%29-200109%28%29-200074%28%29-200081%28%29-200007%28%29-200009%28%29-",
    "mccafe_coffees": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=203087%28%29-200500%28%29-200181%28%29-200186%28%29-204201%28%29-202381%28%29-200020%28%29-203275%28%29-204193%28%29-203885%28%29-204205%28%29-204219%28%29-204196%28%29-204221%28%29-204208%28%29-204189%28%29-204209%28%29-200223%28%29-200149%28%29-200148%28%29-",
    "beverages": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=201677%28%29-201711%28%29-201201%28%29-203072%28%29-200612%28%29-203557%28%29-201971%28%29-202274%28%29-200152%28%29-200155%28%29-203957%28%29-202140%28%29-200626%28%29-202116%28%29-201248%28%29-203082%28%29-200610%28%29-200607%28%29-204206%28%29-200609%28%29-",
    "sauces": "https://www.mcdonalds.com/dnaapp/itemList?country=US&language=en&showLiveData=true&nutrient_req=Y&item=204377%28%29-200412%28%29-200295%28%29-200293%28%29-200411%28%29-200315%28%29-200268%28%29-201157%28%29-201660%28%29-200313%28%29-",
}


HEADERS = {
    "User-Agent": "Mozilla/5.0",
    "Accept": "application/json",
    "Referer": "https://www.mcdonalds.com/us/en-us/about-our-food/nutrition-calculator.html"
}

def extract_nutrients(nutrient_list):
    nutrients = {}
    for n in nutrient_list:
        key = n["nutrient_name_id"]
        value = n.get("value")
        if value:
            try:
                nutrients[key] = float(value)
            except ValueError:
                nutrients[key] = None
    return nutrients

def main():
    all_items = {}
    
    for category_name, url in CATEGORY_URLS.items():
        print(f"\nFetching category: {category_name}")
        
        
        r = requests.get(url, headers=HEADERS)
        r.raise_for_status()

        data = r.json()
        items = data["items"]["item"]

        for item in items:
            nf = item.get("nutrient_facts")
            if not nf:
                continue

            nutrients = extract_nutrients(nf["nutrient"])
            
            item_id = item["item_id"]
            
            if item_id not in all_items:
                all_items[item_id] = {
                    "item_id": item["item_id"],
                    "name": item["item_name"],
                    "restaurant": RESTAURANT,
                    "category": category_name,
                    "item_type": CATEGORY_ITEM_TYPE.get(category_name, "food"),
                    "calories": nutrients.get("calories"),
                    "protein": nutrients.get("protein"),
                    "fat": nutrients.get("fat"),
                    "carbohydrate": nutrients.get("carbohydrate"),
                    "sugars": nutrients.get("sugars"),
                    "sodium": nutrients.get("sodium"),
                }

    output_file = "mcdonalds_items.json"

    with open(output_file, "w", encoding = "utf-8") as f:
        json.dump(list(all_items.values()), f, indent = 2)
        
    print(f"\nSaved {len(all_items)} items to {output_file}")

if __name__ == "__main__":
    main()