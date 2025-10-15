const Post = require('../models/post');
const formidable = require('formidable');
const fs = require('fs');
const _ = require('lodash');
const {ECBrige} = require('../services/ECBrigeComment/EcBrige');
const {ECBrige2} = require('../services/ECBrigeUser/EcBrige');
const sharp = require('sharp');

exports.postById = (req, res, next,id) =>{
    Post.findById(id).populate('postedBy','_id name')
    .populate('comments','text created')
    .populate('comments.postedBy','_id name').exec((err, post)=>{
        if(err || !post) {
            return res.status(400).json({error:err})
        }
        req.post = post;
        next();
    });

};


exports.getPosts = (req, res) =>{
   const posts = Post.find().populate('postedBy','id name')
   .populate('comments','text created')
   .populate('comments.postedBy','_id name ')
   .select('_id title body color emotion created brace initialEmotion initialColor time version blooks photo')
   .sort({created: -1})
   .then((posts)=>{
       res.json(posts);
   })
   .catch(err => console.log(err));
};
//trying to find posts by emotion and color



exports.createPost = (req, res) =>{
    let form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.maxFieldsSize= 2 * 1024 * 1024;
    form.parse(req, (err, fields, files)=>{
        if(err){
            return res.status(400).json({error:'image could not be uploaded'});
        }
        
        let post = new Post(fields);
        const {emotion , color} = post;
        post = _.extend(post,ECBrige2(emotion,color));
        post.postedBy = req.profile;
        req.profile.hashed_password = undefined;
        req.profile.salt = undefined;
        if(files.photo.name.length > 1){
            sharp(files.photo.path)
            .resize(800)
            .withMetadata()
            .toFile(`${__dirname}/uploads/${files.photo.name}`)
            .catch((err)=>{
                if(err){
                    console.log(err)
                }else{
                    console.log('done comperssion')
                    setTimeout(() =>{
                        let photo = {
                            data: fs.readFileSync(`${__dirname}/uploads/${files.photo.name}`)
                        }
                        post.photo.data = photo.data
                        post.photo.contentType = files.photo.type
                        
                    },5000)
                    setTimeout(() =>{
                        post.save((err,result)=>{
                            if(err){
                                return res.status(400).json({error:err});
                            }
                            res.json(result);
                            fs.unlinkSync(`${__dirname}/uploads/${files.photo.name}`)
                        });
                        
                    },8000)
                }
                
            })
            
             
        }
        post.photo.data = fs.readFileSync(files.photo.path)
        post.photo.contentType = files.photo.type
        post.save((err,result)=>{
            if(err){
                return res.status(400).json({error:err});
            }
            res.json(result);
                
        });
            
       
         
        
        
    });
};

exports.updatePost = (req, res, next)=>{
    let form = new formidable.IncomingForm();
    form.keepExtensions = true;
    form.maxFieldsSize= 2 * 1024 * 1024;
    //ECBrige to convort the emotions 
    form.parse(req, (err,fields,files)=>{
        if(err){
            return res.status(400).json({error: 'photo could not be uploaded'})
        }
        let post = req.post;
        let postEmotion = req.post.emotion;
        let postColor = req.post.color;
        
        const {emotion , color} = fields;
        post = _.extend(post,ECBrige(emotion, color,postEmotion, postColor));
        post.updated = Date.now()
        
        
        if(files.photo){
            post.photo.data = fs.readFileSync(files.photo.path)
            post.photo.contentType = files.photo.type
        }
        
        post.save((err,result)=>{
            if(err){
                return res.status(400).json({error:err})
            }
            res.json(post);
        })
    })
}

exports.postsByUser = (req, res)=>{
    Post.find({postedBy : req.profile._id }).populate('postedBy','_id name')
    .select('_id title body color emotion created brace comments initialEmotion initialColor').sort('_created').exec((err,posts)=>{
        if(err){
            return res.status(400).json({error:err})
        }
        res.json({posts})
    })
}

exports.isPoster =(req, res,next) => {
    let isPoster = req.post && req.auth && req.post.postedBy._id == req.auth._id
    if(!isPoster){
        return res.status(403).json({error:'User is not authorized to'});
    }
    next();
};
// exports.updatePost = (req, res, next)=>{
//     let post = req.post;
//     post = _.extend(post, req.body);
//     post.updated = Date.now();
//     post.save(err => {
//         if(err){
//             return res.status(400).json({error:err});
//         }
//         post.hashed_password = undefined;
//         post.salt = undefined;
//         res.json(post);
//     })
// }
exports.deletePost = (req, res) => {
    let post = req.post;
    post.remove((err,post) => {
        if (err) {
            return res.status(400).json({error:err});
        }
        res.json({message:'Post deleted successfully'})
    });
}

exports.photo = (req, res,next) => {
    res.set('Content-Type',req.post.photo.contentType);
    return res.send(req.post.photo.data);
}

exports.singlePost = (req, res,)=> {
    return res.json(req.post);

}

exports.brace = (req, res)=>{
    Post.findByIdAndUpdate(req.body.postId,{$push:{brace : req.body.userId}},{ new:true })
    .exec((err,result) =>{
        if(err){
            res.status(400).json({ error:err})
        }else {
            res.json(result)
        }
    })
}

exports.unBrace = (req, res)=>{
    Post.findByIdAndUpdate(req.body.postId,{$pull:{brace : req.body.userId}},{ new:true })
    .exec((err,result) =>{
        if(err){
            res.status(400).json({ error:err})
        }else {
            res.json(result)
        }
    })
}

exports.comment = (req, res) => {
    let comment = req.body.comment
    comment.postedBy = req.body.userId

    Post.findByIdAndUpdate(req.body.postId,{$push:{comments : comment}},{ new:true })
    .populate('comments.postedBy','_id name color emotion ')
    .populate('postedBy','_id name color emotion')
    .exec((err,result) =>{
        if(err){
            res.status(400).json({ error:err})
        }else {
            res.json(result)
        }
    })
}

exports.unComment = (req, res) => {
    let comment = req.body.comment


    Post.findByIdAndUpdate(req.body.postId,{$pull:{comments : {_id:comment._id}}},{ new:true })
    .populate('comments.postedBy','_id name')
    .populate('postedBy','_id name')
    .exec((err,result) =>{
        if(err){
            res.status(400).json({ error:err})
        }else {
            res.json(result)
        }
    })
}