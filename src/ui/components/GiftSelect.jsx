import React, { useState, useRef, useEffect } from 'react';

const GiftSelect = ({ options = [], value, onChange, disabled }) => {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    const selectedGift = options.find(g => g.name === value);

    const handleSelect = (giftName) => {
        onChange(giftName);
        setIsOpen(false);
    };

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    if (disabled) {
        return (
            <div className="gift-select-trigger" style={{opacity: 0.5, cursor: 'not-allowed'}}>
                {selectedGift ? (
                    <div style={{display:'flex', alignItems:'center'}}>
                        <img src={selectedGift.icon_url} alt="" className="gift-option-icon" style={{width:20, height:20}}/>
                        <span>{selectedGift.name}</span>
                    </div>
                ) : (
                    <span style={{fontSize:12}}>Sin Regalo</span>
                )}
            </div>
        );
    }

    return (
        <div className="gift-select-container" ref={containerRef}>
            <div className="gift-select-trigger" onClick={() => setIsOpen(!isOpen)}>
                {selectedGift ? (
                    <div style={{display:'flex', alignItems:'center'}}>
                        <img src={selectedGift.icon_url} alt="" className="gift-option-icon" style={{width:24, height:24}}/>
                        <span className="gift-option-name" style={{fontSize:13}}>{selectedGift.name}</span>
                    </div>
                ) : (
                    <span style={{opacity:0.6, fontStyle:'italic'}}>Seleccionar Regalo...</span>
                )}
                <span className="select-arrow">▼</span>
            </div>

            {isOpen && (
                <div className="gift-select-dropdown">
                    <div className="gift-option-item" onClick={() => handleSelect('')} style={{fontStyle:'italic', opacity:0.7}}>
                        <span style={{width:24, marginRight:10, textAlign:'center'}}>🚫</span>
                        <span>Ninguno</span>
                    </div>

                    {options.map(gift => (
                        <div key={gift.id} className="gift-option-item" onClick={() => handleSelect(gift.name)}>
                            <img src={gift.icon_url} alt={gift.name} className="gift-option-icon" loading="lazy" />
                            <span className="gift-option-name">{gift.name}</span>
                            <span className="gift-option-diamonds">
                                💎 {gift.diamond_count}
                            </span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// OPTIMIZACIÓN MASTER: React.memo
// Esto evita re-renderizados innecesarios si las props no cambian
export default React.memo(GiftSelect);