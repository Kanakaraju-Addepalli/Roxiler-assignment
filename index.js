const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const axios = require("axios");

const app = express();
const PORT = 3000;

// Create a new SQLite database and initialize the table
const db = new sqlite3.Database("mydatabase.db");
db.serialize(() => {
  db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='products'",
    (err, row) => {
      if (!row) {
        db.run(`CREATE TABLE products (
        id INTEGER PRIMARY KEY,
        title TEXT,
        price REAL,
        description TEXT,
        category TEXT,
        image TEXT,
        sold INTEGER,
        dateOfSale TEXT
      )`);

        // Fetch the JSON data from the third-party API and insert it into the database
        const apiUrl =
          "https://s3.amazonaws.com/roxiler.com/product_transaction.json";

        axios
          .get(apiUrl)
          .then((response) => {
            const data = response.data;
            const stmt = db.prepare(
              "INSERT INTO products (id, title, price, description, category, image, sold, dateOfSale) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            );

            data.forEach((item) => {
              stmt.run(
                item.id,
                item.title,
                item.price,
                item.description,
                item.category,
                item.image,
                item.sold ? 1 : 0, // Convert boolean to integer representation (0 or 1)
                item.dateOfSale
              );
            });

            stmt.finalize();
            console.log("Database initialized with seed data.");
          })
          .catch((error) => {
            console.error(
              "Error fetching data from the third-party API:",
              error
            );
          });
      } else {
        console.log(
          "Table 'products' already exists. Skipping table creation."
        );
      }
    }
  );
});

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/api/statistics", (req, res) => {
  const selectedMonth = req.query.month;

  const query = `
    SELECT
      COUNT(*) as totalItems,
      SUM(price) as totalSaleAmount,
      SUM(CASE WHEN sold = 1 THEN 1 ELSE 0 END) as totalSoldItems,
      SUM(CASE WHEN sold = 0 THEN 1 ELSE 0 END) as totalNotSoldItems
    FROM products
    WHERE SUBSTR(dateOfSale, 6, 2) = ?`;

  db.get(query, [selectedMonth], (err, row) => {
    if (err) {
      console.error("Error executing the query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.json(row);
    }
  });
});

// API to get bar chart data for a selected month
app.get("/api/bar-chart", (req, res) => {
  const selectedMonth = req.query.month;

  const query = `
    SELECT
      COUNT(*) as itemCount,
      CASE
        WHEN price >= 0 AND price <= 100 THEN '0 - 100'
        WHEN price > 100 AND price <= 200 THEN '101 - 200'
        WHEN price > 200 AND price <= 300 THEN '201 - 300'
        WHEN price > 300 AND price <= 400 THEN '301 - 400'
        WHEN price > 400 AND price <= 500 THEN '401 - 500'
        WHEN price > 500 AND price <= 600 THEN '501 - 600'
        WHEN price > 600 AND price <= 700 THEN '601 - 700'
        WHEN price > 700 AND price <= 800 THEN '701 - 800'
        WHEN price > 800 AND price <= 900 THEN '801 - 900'
        ELSE '901 - above'
      END AS priceRange
    FROM products
    WHERE SUBSTR(dateOfSale, 6, 2) = ?
    GROUP BY priceRange
    ORDER BY priceRange`;

  db.all(query, [selectedMonth], (err, rows) => {
    if (err) {
      console.error("Error executing the query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.json(rows);
    }
  });
});

// API to get pie chart data for a selected month
app.get("/api/pie-chart", (req, res) => {
  const selectedMonth = req.query.month;

  // Query to find unique categories and the number of items from each category for the selected month
  const query = `
    SELECT
      category,
      COUNT(*) as itemCount
    FROM products
    WHERE SUBSTR(dateOfSale, 6, 2) = ?
    GROUP BY category`;

  db.all(query, [selectedMonth], (err, rows) => {
    if (err) {
      console.error("Error executing the query:", err);
      res.status(500).json({ error: "Internal Server Error" });
    } else {
      res.json(rows);
    }
  });
});

// API to fetch data from all three APIs and combine the responses
app.get("/api/combined-data", async (req, res) => {
  const selectedMonth = req.query.month;

  try {
    // Fetch data from all three APIs using Promise.all
    const [
      statisticsResponse,
      barChartResponse,
      pieChartResponse,
    ] = await Promise.all([
      axios.get(`http://localhost:3000/api/statistics?month=${selectedMonth}`),
      axios.get(`http://localhost:3000/api/bar-chart?month=${selectedMonth}`),
      axios.get(`http://localhost:3000/api/pie-chart?month=${selectedMonth}`),
    ]);

    // Combine the responses into a single JSON object
    const combinedData = {
      statistics: statisticsResponse.data,
      barChart: barChartResponse.data,
      pieChart: pieChartResponse.data,
    };

    res.json(combinedData);
  } catch (error) {
    console.error("Error fetching data from APIs:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});
