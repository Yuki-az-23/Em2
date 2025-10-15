exports.red = (postEmotion, postColor) => {   
    if(postEmotion === 'Anticipated' && postColor ==='red'){
      return{emotion:'Sad', color:'pink'};
    }
}