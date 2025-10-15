const mongoose = require('mongoose');
const {ObjectId} = mongoose.Schema
const { Schema} = mongoose
const postSchman = new mongoose.Schema({
    title:{
        type: String,
        require:true,
    },
    body:{
        type: String,
    },
    photo:{
        data:Buffer,
        contentType:String
    },
    postedBy:{
        type: ObjectId,
        ref:'User'
    },
    created:{
        type: Date,
        default:Date.now
    },
    color:{
        type:String,
        require: true,
    },
    emotion:{
        type:String,
        require: true,
    },
    initialEmotion:{
        type:String,
        require: true,
    },
    initialColor:{
        type:String,
        require:true,
    },
    updated:Date,
    brace: [{type:ObjectId , ref:'User'}],
    comments:[{text: String,created:{type:Date,default:Date.now},postedBy:{type:ObjectId,ref:'User'}}],
    time:{type:String},
    version:{type:String},
    blooks:{type:Schema.Types.Mixed}
});

module.exports =mongoose.model('Post',postSchman);