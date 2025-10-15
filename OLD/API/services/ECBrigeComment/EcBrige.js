const {angry} = require('./emotions/angry/angry');
const {anticipated} = require('./emotions/anticipated/anticipated');
const {disgust} = require('./emotions/disgust/disgust');
const {feared} = require('./emotions/feared/feared');
const {joy} = require('./emotions/joy/joy');
const {sad} = require('./emotions/sad/sad');
const {surprised} = require('./emotions/surprised/surprised');
const {trust} = require('./emotions/trust/trust');





exports.ECBrige = (userEmotion, userColor,postEmotion, postColor) => {
  try {
    if(userEmotion === 'Angry'){
      return angry(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Anticipated'){
      return anticipated(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Disgust'){
      return disgust(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Feared'){
      return feared(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Joy'){
      return joy(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Sad'){
      return sad(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Surprised'){
      return surprised(userEmotion, userColor,postEmotion, postColor)
    }else if(userEmotion === 'Trust'){
      return trust(userEmotion, userColor,postEmotion, postColor)
    } 
  }catch (undefined) {
    return{emotion:'Disgust', color:'orange'};
  }         
}

  



