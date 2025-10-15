const User = require('../models/user');
const jwt = require('jsonwebtoken');
const expressJwt = require('express-jwt')
require('dotenv').config();


exports.signup = async (req, res) =>{
    const userExists = await User.findOne({email:req.body.email})
    if(userExists)
     return res.status(403).json({
        error:'Email is taken'
    })
    const user = await new User(req.body)
    await user.save()
    res.status(200).json({ message:'sginup success! Please login.' })
};

exports.signin = (req, res) => {
    //find user by email
    const {email,password} = req.body
    User.findOne({email}, (err, user) =>{
        //if err or no user exist
        if(err || !user){
            return res.status(401).json({ error: 'user with that email does not exist. please sginin.'})
        }
        // if user is fpinc make sure the email and password match

        //create authenticate methond in model and use here
        if(!user.authenticate(password)){
            return res.status(401).json({ error: 'Email and password does not match'})
        }

    // generate a token with uuser id and secret
        const token = jwt.sign({_id:user._id}, process.env.JWT_SECRET)
    //persist the token as 't' in cooke with expiry date
        res.cookie('t',token,{expire:new Date() + 9999})
    //return respone with user and token to front client
    const {_id, name, email,emotion,color} = user
    return res.json({token,user:{_id, email , name ,emotion,color}})
    })
  
}

exports.signout = (req, res) => {
    res.clearCookie('t')
    return res.json({message:'signOut Sucsuss'})
};

exports.requireSignin = expressJwt({
    //if the token is valid, express jwt appends the verification users id 
    // in an Authorization key to the request body
    secret: process.env.JWT_SECRET ,algorithms: ['HS256'] ,
    userProperty: 'auth'
});