# LIUTaoran-Europe-Restaurant
[Données semi structurées et sémantique] Mini-projet - de la modélisation à la visualisation
---
## Local Operation Instructions
### Configure the Database

1. Download Apache Jena Fuseki (binary distribution) from the official website: https://jena.apache.org/download/
2. Unzip, enter the Fuseki directory, and double-click to run `fuseki-server.bat`
3. Open in your browser: http://127.0.0.1:3030
4. Go to `Manage` → `New Dataset`

   - Dataset name: `European_restaurants`
   - Dataset type: `Persistent (TDB2)`

6. Upload the data file `European_Restaurants.trig` into the dataset

### Run

1. Open `european_restaurant/index.html` in your browser. No additional plugins are needed.
