const colors = require('./colors/index');

exports.feared = (userEmotion, userColor,postEmotion, postColor) => {
    try {
        return colors[userColor](userEmotion, userColor,postEmotion, postColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Feared', color:'green'};
    }
}