import React , { useState , useEffect, useRef } from 'react';
import EditorJS from '@editorjs/editorjs';
import Embed from '@editorjs/embed'; 
 
const DEFAULT_INITIAL_DATA = () => {
  return {
    "time": new Date().getTime(),
    "blocks": []
  }
}
 
const EDITTOR_HOLDER_ID = 'editorjs';
 
const Editor = (props) => {
  const ejInstance = useRef();
  const [editorData, setEditorData] = useState(DEFAULT_INITIAL_DATA);
 
  // This will run only once
  useEffect(() => {
    if (!ejInstance.current) {
      initEditor();
    }
    return () => {
      ejInstance.current.destroy();
      ejInstance.current = null;
    }
  }, []);
 
  const initEditor = () => {
    const editor = new EditorJS({
      holder: EDITTOR_HOLDER_ID,
      logLevel: "ERROR",
      data: editorData,
      onReady: () => {
        ejInstance.current = editor;
      },
      onChange:async() => {
        await editor.save().then((data) => {
            setEditorData(data)
        });
        // Put your logic here to save this data to your DB
      },
      autofocus: true,
      tools: { 
        embed: Embed, 
      }, 
    });
  };

  

  console.log(editorData);
  props.editorData(editorData)
 
  return (
    <React.Fragment>
      <div id={EDITTOR_HOLDER_ID}> </div>
    </React.Fragment>
  );
}
 
export default Editor;