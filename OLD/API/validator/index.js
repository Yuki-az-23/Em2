exports.createPostValidator = (req, res, next) =>{

    //title
    req.check('title','wirte a Title').notEmpty();
    req.check('title','title must be between 4 to 150 characters').isLength({
        min:4,
        max:150
    });

    //body
    req.check('body','wirte a body').notEmpty();
    req.check('body','body must be between 4 to 150 characters').isLength({
        min:4,
        max:150
    });
    //color
    req.check('color','input a color').notEmpty();
    req.check('color','color must be between 4 to 150 characters').isLength({
        min:4,
        max:7
    });
    //emotion
    req.check('emotion','input a emotion').notEmpty();
    req.check('emotion','emotion must be between 3 to 10 characters').isLength({
        min:3,
        max:10
    });

    //error for errors
    const errors = req.validationErrors();
    //if error show the first on at they happen
    if(errors){
        const firstError = errors.map(error => error.msg)[0]
        return res.status(400).json({error:firstError})
    }

    // proceed to next middleware
    next();
}

exports.userSignupValidator = (req, res, next) =>{
    // name is not null and between 3-10 characters
    req.check('name','name is required').notEmpty();
    //email is not null ,valid and normalized 
    req.check('email','emaill must be between 3 to 32 characters').matches(/.\@.+\..+/).withMessage('email must contain @').isLength({min:4,max:200})
    // check for password
    req.check('password','password is required').notEmpty();
    req.check('password').isLength({min:6}).withMessage('password must contian at least 6 chrecters').matches(/\d/).withMessage('password most cointain a number')

    //check for errors
    const errors = req.validationErrors();
    //if error show the first on at they happen
    if(errors){
        const firstError = errors.map(error => error.msg)[0]
        return res.status(400).json({error:firstError})
    }

    // proceed to next middleware
    next();
}