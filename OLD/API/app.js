const express = require('express');
const app = express();
const morgan = require('morgan');
const mongoose = require('mongoose');
const expressValidator = require('express-validator');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const cookieParser = require('cookie-parser');
const fs = require('fs');
const cors = require('cors');
const path = require('path');
//ssl options




dotenv.config()

//DB
// mongoose.connect(process.env.MONGO_URI,{ useNewUrlParser: true })
// .then(()=> console.log('DB Connected'));

// mongoose.connection.on('error',err =>{
//     console.log(`DB Conction error ${err.message}`);
// })
mongoose.set("strictQuery", false);
mongoose.connect(process.env.MONGO_URL, () => {
  console.log("Connected to MongoDB");
});

// routes
const postRoutes = require('./routes/post');
const authRoutes = require('./routes/auth');
const userRoutes = require('./routes/user');

//apiDocs

app.get('/',(req, res) => {
  fs.readFile('docs/apiDocs.json', (err, data) => {
    if (err) {
      res.status(400).json({error:err});
    }
    const docs = JSON.parse(data);
    res.json(docs);
  })
})
// midelewre
app.use(morgan('dev'));
app.use(bodyParser.json());
app.use(cookieParser());
app.use(expressValidator());
app.use(cors());
app.use('/',postRoutes);
app.use('/',authRoutes);
app.use('/',userRoutes);
app.use(function (err, req, res, next) {
    if (err.name === 'UnauthorizedError') {
      res.status(401).json({error:'invalid token...'});
    }
  });
// app.use(express.static(path.join(__dirname, '../react-front/build')))
const port = process.env.PORT  || 8080 ;
app.listen(port, ()=>{
    console.log(`a node js api is lisining to : ${port}`);
});

