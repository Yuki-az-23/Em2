const colors = require('./colors/index');

exports.feared = (userEmotion, userColor) => {
    try {
        return colors[userColor](userEmotion, userColor);
    } catch (undefined) {
        // you may choose some color default
        return{emotion:'Feared', color:'green'};
    }
}