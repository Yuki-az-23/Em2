import React,{useState,useRef,useEffect} from 'react';
import { isAuthenticated } from '../auth/index';
import {updateECbrige} from '../user/UserApi';
import EcBridgeCss from './css/EcBridge.css';

const EcBridge = (props) => {
    const [EcBridge,setEcbridge] = useState({
        color: '',
        emotion:'',
        shown:false,
    })
    const form = useRef(null)
    const{shown} = EcBridge
    const handleChange = name => event => {
        const value = name === 'photo' ? event.target.files[0] : event.target.value;
        setEcbridge({...EcBridge, [name]: value});
        }
    
    const clickSubmit = (e) =>{
        e.preventDefault()
        const userData = new FormData(form.current);
        const userId = isAuthenticated().user._id;
        const token = isAuthenticated().token;
        updateECbrige(userId,token,userData).then((data) => {
            if (data.error){
                setEcbridge({ error: data.error})
            }else{
                setEcbridge({
                    shown:true,
                    color:data.color,
                    emotion:data.emotion,
                
                })
                } 
            }
        )
        
    }
    useEffect(() => {
        setTimeout(() =>{
            setEcbridge({shown:false})
            },400000)
    },[]);

    const close = () =>{
        setEcbridge({shown:true});
    }
    
    return(
        <div className="container">
        {!isAuthenticated().user || shown ? (<div></div>) : (<><div className='modal-dialog modal2'>
        <div className='modal-content'>
            <div className='modal-header'><h2>Set your bridge</h2>
            <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close" onClick={close}></button>
            </div>
            <div className='modal-header'><p>The bridge will show the repeats you will see in your own feed, based on calculating of the color and emotion that you choose and will set the response to other repeats. </p></div>
            <div className='modal-body'>
            <form ref={form}><label className="text-muted">select current emotion</label>
                <select className='form-select' name="emotion" onChange={handleChange('emotion')} value={EcBridge.emotion} >
                    <option value="Joy">Joy</option>
                    <option value="Trust">Trust</option>
                    <option value="Feared">Feared</option>
                    <option value="Surprised">Surprised</option>
                    <option value="Sad">Sad</option>
                    <option value="Disgust">Disgust</option>
                    <option value="Angry">Angry</option>
                    <option value="Anticipated">Anticipated</option>
            </select>
                <label className="text-muted">select current Color</label>
                <select className='form-select' name='color' onChange={handleChange('color')} value={EcBridge.color}>
                    <option value="yellow">yellow</option>
                    <option value="lime">lime</option>
                    <option value="green">green</option>
                    <option value="aqua">aqua</option>
                    <option value="blue">blue</option>
                    <option value="pink">pink</option>
                    <option value="red">red</option>
                    <option value="orange">orange</option>
            </select>
            </form>
            </div>
            <div className='modal-footer center'>
            <button onClick={clickSubmit} type="submit" className="btn btn-raised btn-primary">Repeat</button>
            </div>
        </div>
        
            
            
            
            </div> </>)}
            
        </div>
        
    )
}

export default EcBridge;



