const colors = require('./colors/index');

exports.sad = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Sad', color:'blue'};
    }
}