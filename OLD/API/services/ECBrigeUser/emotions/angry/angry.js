const colors = require('./colors/index');

exports.angry = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Angry', color:'red'};
    }
}