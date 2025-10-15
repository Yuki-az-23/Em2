import React from 'react';
import {follow,unfollow} from './UserApi';
const FollowProfileBtn = (props) =>{
    const followClick = ()=>{
        props.onClickedHandle(follow)
    }
    const unfollowClick = ()=>{
        props.onClickedHandle(unfollow)
    }
    return (
        <div className="mt-4 center ">
        {!props.following ? (<button onClick={followClick} className="btn btn-success btn-raised mr-2">Follow</button>) :
         (<button onClick={unfollowClick} className="btn btn-warning btn-raised ">UnFollow</button>)}
            
            
        </div>
    )
}


export default FollowProfileBtn;