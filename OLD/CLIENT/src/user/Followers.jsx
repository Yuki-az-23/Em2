import React , {useState,useEffect} from 'react';
import DefaultProfile from '../images/avater.png';
import { Link } from 'react-router-dom';
import { isAuthenticated } from '../auth/index';
import { read } from './UserApi';
import followingCss from './css/following.css';

const Followers = (props) => {
    const [followers,setFollowers] = useState([])
    const userId = props.match.params.userId;
    const token = isAuthenticated().token;

    useEffect(() => {
        read(userId,token)
        .then(data =>{
            if(!data.error){               
                setFollowers(data.followers)
                
            }if(data.error){
                console.log(data.error);
            }
        })
    }, [])
    return (
        <div className="center col-auto ">
                        <h3>Followers</h3>
                        
                         {followers.map((person,i)=>{
                             return  <div className='follower center' key={i}>
                                        <div className='row'>
                                            <Link to={`/user/${person._id}`}>
                                             <img className='float-left mr-2 img-avter'
                                              
                                                onError={i => (i.target.src = `${DefaultProfile}`)} 
                                                 src={`${process.env.REACT_APP_API_URL}/user/photo/${person._id}`} 
                                                 alt={person.name}/>
                                             </Link>
                                             
                                        </div>
                                        <Link className='link3' to={`/user/${person._id}`}>
                                        <h2 className='follower-name'>{person.name}</h2>
                                        </Link>
                                     </div>
                                     })}
                     </div>
    )
}
export default Followers;