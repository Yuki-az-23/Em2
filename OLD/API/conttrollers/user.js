const User = require('../models/user');
const _ = require('lodash')
const formidable = require('formidable');
const fs = require('fs');
const {ECBrige2} = require('../services/ECBrigeUser/EcBrige');
const Post = require('../models/post');
const sharp = require('sharp');

exports.userById = (req, res, next,id) => {
    User.findById(id)
    .populate('following','_id name')
    .populate('followers','_id name')
    .exec((err, user) => {
        if(err || !user){
            return res.status(400).json({error:'user Not Found'})
            error:'User not found'
        }
        req.profile = user;
        next();
    });
};

exports.hasAuthorization = (req, res, next)=>{
    const authorized = req.profile && req.auth && req.profile._id === req.auth._id
    if(!authorized){
        return res.status(403).json({error:'user is not authorized to preform this action'})
    }
}

exports.allUsers = (req, res) => {
    User.find((err,users) => {
        if(err){
            return res.status(400).json({error: err})
        }
        res.json(users);
    }).select('name email created updated emotion color');
};

exports.getUser = (req, res)=>{
    req.profile.hashed_password = undefined;
    req.profile.salt = undefined;
    return res.json(req.profile);
};

exports.updateUser = (req, res, next)=>{
    let form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.parse(req, (err,fields,files)=>{
        if(err){
            return res.status(400).json({error: 'photo could not be uploaded'})
        }
        let user = req.profile;
        user = _.extend(user, fields)
        user.updated = Date.now()

        if(files.photo){
            sharp(files.photo.path)
            .resize(800)
            .withMetadata()
            .toFile(`${__dirname}/uploads/${files.photo.name}`)
            setTimeout(() =>{
                let photo = {
                    data: fs.readFileSync(`${__dirname}/uploads/${files.photo.name}`)
                }
                user.photo.data = photo.data
                user.photo.contentType = files.photo.type
                
            },5000)
        }
        setTimeout(() =>{
            user.save((err,result)=>{
                if(err){
                    return res.status(400).json({error:err})
                }
                user.hashed_password = undefined;
                user.salt = undefined;
                fs.unlinkSync(`${__dirname}/uploads/${files.photo.name}`)
                res.json(user);
            })
        },10000)
        
    })
}

exports.updateECBrige = (req, res, next)=>{
    let form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.parse(req, (err,fields)=>{
        if(err){
            return res.status(400).json({error: 'could not update ECbrige'})
        }
        const {emotion,color} = fields;
        let user = req.profile;
        user = _.extend(user, ECBrige2(emotion,color))
        user.updated = Date.now()
        user.save((err,result)=>{
            if(err){
                return res.status(400).json({error:err})
            }
            user.hashed_password = undefined;
            user.salt = undefined;
            res.json(user);
        })
    })
}

exports.userPhoto = (req, res,next) => {
    if(req.profile.photo.data){
        res.set('Content-Type', req.profile.photo.contentType)
        return res.send(req.profile.photo.data);
    }
    next();
}

exports.deleteUser = (req, res,next)=>{
    let user = req.profile;
    user.remove((err, user)=>{
        if(err){
            return res.status(400).json({error:err})
        }
        res.json({message:'user deleted successfully'});
        Post.find({postedBy : req.profile._id }).deleteMany((err, posts)=>{
            if(err){
                return res.status(400).json({error:err})
            }
            console.log('user posts deleted successfully');
        })
    })
    
    
}

//follow unfollow
exports.addFollowing= (req, res, next)=>{
    User.findByIdAndUpdate(req.body.userId,{$push:{following: req.body.followId}},(err,result)=>{
        if(err){
            return res.status(400).json({error: err})
        }
        next();
    });
};

exports.addFollower= (req, res)=>{
    User.findByIdAndUpdate(req.body.followId,{$push:{followers: req.body.userId}},{new:true})
    .populate('following','_id name')
    .populate('followers','_id name')
    .exec((err,result)=>{
        if(err){
            return res.status(400).json({error:err})
        }
        result.hashed_password = undefined;
        result.salt = undefined;
        res.json(result);
    })
};

exports.removeFollowing= (req, res, next)=>{
    User.findByIdAndUpdate(req.body.userId,{$pull:{following: req.body.unfollowId}},(err,result)=>{
        if(err){
            return res.status(400).json({error: err})
        }
        next();
    });
};

exports.removeFollower= (req, res)=>{
    User.findByIdAndUpdate(req.body.unfollowId,{$pull:{followers: req.body.userId}},{new:true})
    .populate('following','_id name')
    .populate('followers','_id name')
    .exec((err,result)=>{
        if(err){
            return res.status(400).json({error:err})
        }
        result.hashed_password = undefined;
        result.salt = undefined;
        res.json(result);
    })
};