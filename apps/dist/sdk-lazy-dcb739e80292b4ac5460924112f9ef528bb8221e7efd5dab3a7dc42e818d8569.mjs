export default {
  "artifact_version": 1,
  "noir_version": "1.0.0-rc.3+5a7ee9bf5ed8973076df7bb0d2b723024db09ae7",
  "hash": "7786123682966289170",
  "abi": {
    "abi_version": 1,
    "parameters": [
      {
        "name": "tx_request",
        "type": {
          "kind": "struct",
          "path": "types::abis::transaction::tx_request::TxRequest",
          "fields": [
            {
              "name": "origin",
              "type": {
                "kind": "struct",
                "path": "types::address::aztec_address::AztecAddress",
                "fields": [
                  {
                    "name": "inner",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "args_hash",
              "type": {
                "kind": "field"
              }
            },
            {
              "name": "tx_context",
              "type": {
                "kind": "struct",
                "path": "types::abis::transaction::tx_context::TxContext",
                "fields": [
                  {
                    "name": "chain_id",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "version",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "gas_settings",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::gas_settings::GasSettings",
                      "fields": [
                        {
                          "name": "gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "teardown_gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_priority_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            },
            {
              "name": "function_data",
              "type": {
                "kind": "struct",
                "path": "types::abis::function_data::FunctionData",
                "fields": [
                  {
                    "name": "selector",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::function_selector::FunctionSelector",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "is_private",
                    "type": {
                      "kind": "boolean"
                    }
                  }
                ]
              }
            },
            {
              "name": "salt",
              "type": {
                "kind": "field"
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "vk_tree_root",
        "type": {
          "kind": "field"
        },
        "visibility": "private"
      },
      {
        "name": "protocol_contracts",
        "type": {
          "kind": "struct",
          "path": "types::abis::protocol_contracts::ProtocolContracts",
          "fields": [
            {
              "name": "derived_addresses",
              "type": {
                "kind": "array",
                "length": 11,
                "type": {
                  "kind": "struct",
                  "path": "types::address::aztec_address::AztecAddress",
                  "fields": [
                    {
                      "name": "inner",
                      "type": {
                        "kind": "field"
                      }
                    }
                  ]
                }
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "private_call",
        "type": {
          "kind": "struct",
          "path": "types::abis::private_kernel::private_call_data::PrivateCallDataWithoutPublicInputs",
          "fields": [
            {
              "name": "vk",
              "type": {
                "kind": "struct",
                "path": "types::proof::verification_key::VerificationKey",
                "fields": [
                  {
                    "name": "key",
                    "type": {
                      "kind": "array",
                      "length": 151,
                      "type": {
                        "kind": "field"
                      }
                    }
                  },
                  {
                    "name": "hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "verification_key_hints",
              "type": {
                "kind": "struct",
                "path": "types::abis::private_kernel::private_call_data::PrivateVerificationKeyHints",
                "fields": [
                  {
                    "name": "salted_initialization_hash",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::salted_initialization_hash::SaltedInitializationHash",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "public_keys",
                    "type": {
                      "kind": "struct",
                      "path": "types::public_keys::PublicKeys",
                      "fields": [
                        {
                          "name": "npk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "ivpk_m",
                          "type": {
                            "kind": "struct",
                            "path": "types::public_keys::IvpkM",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "std::embedded_curve_ops::EmbeddedCurvePoint",
                                  "fields": [
                                    {
                                      "name": "x",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "y",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "ovpk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "tpk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "mspk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "fbpk_m_hash",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "contract_class_artifact_hash",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "contract_class_public_bytecode_commitment",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "function_leaf_membership_witness",
                    "type": {
                      "kind": "struct",
                      "path": "types::merkle_tree::membership::MembershipWitness",
                      "fields": [
                        {
                          "name": "leaf_index",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "sibling_path",
                          "type": {
                            "kind": "array",
                            "length": 7,
                            "type": {
                              "kind": "field"
                            }
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "updated_class_id_witness",
                    "type": {
                      "kind": "struct",
                      "path": "types::merkle_tree::membership::MembershipWitness",
                      "fields": [
                        {
                          "name": "leaf_index",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "sibling_path",
                          "type": {
                            "kind": "array",
                            "length": 40,
                            "type": {
                              "kind": "field"
                            }
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "updated_class_id_leaf",
                    "type": {
                      "kind": "struct",
                      "path": "types::data::public_data_tree_leaf_preimage::PublicDataTreeLeafPreimage",
                      "fields": [
                        {
                          "name": "slot",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "value",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "next_slot",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "next_index",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "updated_class_id_delayed_public_mutable_values",
                    "type": {
                      "kind": "array",
                      "length": 3,
                      "type": {
                        "kind": "field"
                      }
                    }
                  }
                ]
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "app_public_inputs",
        "type": {
          "kind": "struct",
          "path": "types::abis::private_circuit_public_inputs::PrivateCircuitPublicInputs",
          "fields": [
            {
              "name": "call_context",
              "type": {
                "kind": "struct",
                "path": "types::abis::call_context::CallContext",
                "fields": [
                  {
                    "name": "msg_sender",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "contract_address",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "function_selector",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::function_selector::FunctionSelector",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "is_static_call",
                    "type": {
                      "kind": "boolean"
                    }
                  }
                ]
              }
            },
            {
              "name": "args_hash",
              "type": {
                "kind": "field"
              }
            },
            {
              "name": "returns_hash",
              "type": {
                "kind": "field"
              }
            },
            {
              "name": "anchor_block_header",
              "type": {
                "kind": "struct",
                "path": "types::abis::block_header::BlockHeader",
                "fields": [
                  {
                    "name": "last_archive",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                      "fields": [
                        {
                          "name": "root",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "next_available_leaf_index",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "state",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::state_reference::StateReference",
                      "fields": [
                        {
                          "name": "l1_to_l2_message_tree",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                            "fields": [
                              {
                                "name": "root",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "next_available_leaf_index",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "partial",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::partial_state_reference::PartialStateReference",
                            "fields": [
                              {
                                "name": "note_hash_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "nullifier_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "public_data_tree",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                  "fields": [
                                    {
                                      "name": "root",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "next_available_leaf_index",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "sponge_blob_hash",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "tx_effects_tree_root",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "global_variables",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::global_variables::GlobalVariables",
                      "fields": [
                        {
                          "name": "chain_id",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "version",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "block_number",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 32
                          }
                        },
                        {
                          "name": "slot_number",
                          "type": {
                            "kind": "field"
                          }
                        },
                        {
                          "name": "timestamp",
                          "type": {
                            "kind": "integer",
                            "sign": "unsigned",
                            "width": 64
                          }
                        },
                        {
                          "name": "coinbase",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::eth_address::EthAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "fee_recipient",
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "gas_fees",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "total_fees",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "total_mana_used",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "tx_context",
              "type": {
                "kind": "struct",
                "path": "types::abis::transaction::tx_context::TxContext",
                "fields": [
                  {
                    "name": "chain_id",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "version",
                    "type": {
                      "kind": "field"
                    }
                  },
                  {
                    "name": "gas_settings",
                    "type": {
                      "kind": "struct",
                      "path": "types::abis::gas_settings::GasSettings",
                      "fields": [
                        {
                          "name": "gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "teardown_gas_limits",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas::Gas",
                            "fields": [
                              {
                                "name": "da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        },
                        {
                          "name": "max_priority_fees_per_gas",
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::gas_fees::GasFees",
                            "fields": [
                              {
                                "name": "fee_per_da_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              },
                              {
                                "name": "fee_per_l2_gas",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 128
                                }
                              }
                            ]
                          }
                        }
                      ]
                    }
                  }
                ]
              }
            },
            {
              "name": "min_revertible_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "is_fee_payer",
              "type": {
                "kind": "boolean"
              }
            },
            {
              "name": "expiration_timestamp",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 64
              }
            },
            {
              "name": "start_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "end_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "expected_non_revertible_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "expected_revertible_side_effect_counter",
              "type": {
                "kind": "integer",
                "sign": "unsigned",
                "width": 32
              }
            },
            {
              "name": "note_hash_read_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::side_effect::counted::Counted",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "counter",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "nullifier_read_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::scoped::Scoped",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::side_effect::counted::Counted",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "counter",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "contract_address",
                            "type": {
                              "kind": "struct",
                              "path": "types::address::aztec_address::AztecAddress",
                              "fields": [
                                {
                                  "name": "inner",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "key_validation_requests_and_separators",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::abis::validation_requests::key_validation_request_and_separator::KeyValidationRequestAndSeparator",
                        "fields": [
                          {
                            "name": "request",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::validation_requests::key_validation_request::KeyValidationRequest",
                              "fields": [
                                {
                                  "name": "pk_m_hash",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "sk_app",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "key_type_domain_separator",
                            "type": {
                              "kind": "field"
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "private_call_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 8,
                      "type": {
                        "kind": "struct",
                        "path": "types::abis::private_call_request::PrivateCallRequest",
                        "fields": [
                          {
                            "name": "call_context",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::call_context::CallContext",
                              "fields": [
                                {
                                  "name": "msg_sender",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "contract_address",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "function_selector",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::abis::function_selector::FunctionSelector",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "integer",
                                          "sign": "unsigned",
                                          "width": 32
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "is_static_call",
                                  "type": {
                                    "kind": "boolean"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "args_hash",
                            "type": {
                              "kind": "field"
                            }
                          },
                          {
                            "name": "returns_hash",
                            "type": {
                              "kind": "field"
                            }
                          },
                          {
                            "name": "start_side_effect_counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          },
                          {
                            "name": "end_side_effect_counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "public_call_requests",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 32,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::public_call_request::PublicCallRequest",
                              "fields": [
                                {
                                  "name": "msg_sender",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "contract_address",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::aztec_address::AztecAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "is_static_call",
                                  "type": {
                                    "kind": "boolean"
                                  }
                                },
                                {
                                  "name": "calldata_hash",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "public_teardown_call_request",
              "type": {
                "kind": "struct",
                "path": "types::abis::public_call_request::PublicCallRequest",
                "fields": [
                  {
                    "name": "msg_sender",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "contract_address",
                    "type": {
                      "kind": "struct",
                      "path": "types::address::aztec_address::AztecAddress",
                      "fields": [
                        {
                          "name": "inner",
                          "type": {
                            "kind": "field"
                          }
                        }
                      ]
                    }
                  },
                  {
                    "name": "is_static_call",
                    "type": {
                      "kind": "boolean"
                    }
                  },
                  {
                    "name": "calldata_hash",
                    "type": {
                      "kind": "field"
                    }
                  }
                ]
              }
            },
            {
              "name": "note_hashes",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "field"
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "nullifiers",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::nullifier::Nullifier",
                              "fields": [
                                {
                                  "name": "value",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "note_hash",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "l2_to_l1_msgs",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 8,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                              "fields": [
                                {
                                  "name": "recipient",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::address::eth_address::EthAddress",
                                    "fields": [
                                      {
                                        "name": "inner",
                                        "type": {
                                          "kind": "field"
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "content",
                                  "type": {
                                    "kind": "field"
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "private_logs",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 16,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::private_log::PrivateLogData",
                              "fields": [
                                {
                                  "name": "log",
                                  "type": {
                                    "kind": "struct",
                                    "path": "types::abis::log::Log",
                                    "fields": [
                                      {
                                        "name": "fields",
                                        "type": {
                                          "kind": "array",
                                          "length": 16,
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      },
                                      {
                                        "name": "length",
                                        "type": {
                                          "kind": "integer",
                                          "sign": "unsigned",
                                          "width": 32
                                        }
                                      }
                                    ]
                                  }
                                },
                                {
                                  "name": "note_hash_counter",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "contract_class_logs_hashes",
              "type": {
                "kind": "struct",
                "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                "fields": [
                  {
                    "name": "array",
                    "type": {
                      "kind": "array",
                      "length": 1,
                      "type": {
                        "kind": "struct",
                        "path": "types::side_effect::counted::Counted",
                        "fields": [
                          {
                            "name": "inner",
                            "type": {
                              "kind": "struct",
                              "path": "types::abis::log_hash::LogHash",
                              "fields": [
                                {
                                  "name": "value",
                                  "type": {
                                    "kind": "field"
                                  }
                                },
                                {
                                  "name": "length",
                                  "type": {
                                    "kind": "integer",
                                    "sign": "unsigned",
                                    "width": 32
                                  }
                                }
                              ]
                            }
                          },
                          {
                            "name": "counter",
                            "type": {
                              "kind": "integer",
                              "sign": "unsigned",
                              "width": 32
                            }
                          }
                        ]
                      }
                    }
                  },
                  {
                    "name": "length",
                    "type": {
                      "kind": "integer",
                      "sign": "unsigned",
                      "width": 32
                    }
                  }
                ]
              }
            },
            {
              "name": "protocol_nullifier",
              "type": {
                "kind": "field"
              }
            }
          ]
        },
        "visibility": "private"
      },
      {
        "name": "is_private_only",
        "type": {
          "kind": "boolean"
        },
        "visibility": "private"
      },
      {
        "name": "revertible_counter_hint",
        "type": {
          "kind": "integer",
          "sign": "unsigned",
          "width": 32
        },
        "visibility": "private"
      }
    ],
    "return_type": {
      "abi_type": {
        "kind": "struct",
        "path": "types::abis::kernel_circuit_public_inputs::private_kernel_circuit_public_inputs::PrivateKernelCircuitPublicInputs",
        "fields": [
          {
            "name": "constants",
            "type": {
              "kind": "struct",
              "path": "types::abis::private_tx_constant_data::PrivateTxConstantData",
              "fields": [
                {
                  "name": "anchor_block_header",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::block_header::BlockHeader",
                    "fields": [
                      {
                        "name": "last_archive",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                          "fields": [
                            {
                              "name": "root",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "next_available_leaf_index",
                              "type": {
                                "kind": "field"
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "state",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::state_reference::StateReference",
                          "fields": [
                            {
                              "name": "l1_to_l2_message_tree",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                "fields": [
                                  {
                                    "name": "root",
                                    "type": {
                                      "kind": "field"
                                    }
                                  },
                                  {
                                    "name": "next_available_leaf_index",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "partial",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::partial_state_reference::PartialStateReference",
                                "fields": [
                                  {
                                    "name": "note_hash_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "nullifier_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  },
                                  {
                                    "name": "public_data_tree",
                                    "type": {
                                      "kind": "struct",
                                      "path": "types::abis::append_only_tree_snapshot::AppendOnlyTreeSnapshot",
                                      "fields": [
                                        {
                                          "name": "root",
                                          "type": {
                                            "kind": "field"
                                          }
                                        },
                                        {
                                          "name": "next_available_leaf_index",
                                          "type": {
                                            "kind": "field"
                                          }
                                        }
                                      ]
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "sponge_blob_hash",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "tx_effects_tree_root",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "global_variables",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::global_variables::GlobalVariables",
                          "fields": [
                            {
                              "name": "chain_id",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "version",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "block_number",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 32
                              }
                            },
                            {
                              "name": "slot_number",
                              "type": {
                                "kind": "field"
                              }
                            },
                            {
                              "name": "timestamp",
                              "type": {
                                "kind": "integer",
                                "sign": "unsigned",
                                "width": 64
                              }
                            },
                            {
                              "name": "coinbase",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::eth_address::EthAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "fee_recipient",
                              "type": {
                                "kind": "struct",
                                "path": "types::address::aztec_address::AztecAddress",
                                "fields": [
                                  {
                                    "name": "inner",
                                    "type": {
                                      "kind": "field"
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "gas_fees",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      },
                      {
                        "name": "total_fees",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "total_mana_used",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "tx_context",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::transaction::tx_context::TxContext",
                    "fields": [
                      {
                        "name": "chain_id",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "version",
                        "type": {
                          "kind": "field"
                        }
                      },
                      {
                        "name": "gas_settings",
                        "type": {
                          "kind": "struct",
                          "path": "types::abis::gas_settings::GasSettings",
                          "fields": [
                            {
                              "name": "gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "teardown_gas_limits",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas::Gas",
                                "fields": [
                                  {
                                    "name": "da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  },
                                  {
                                    "name": "l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 32
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            },
                            {
                              "name": "max_priority_fees_per_gas",
                              "type": {
                                "kind": "struct",
                                "path": "types::abis::gas_fees::GasFees",
                                "fields": [
                                  {
                                    "name": "fee_per_da_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  },
                                  {
                                    "name": "fee_per_l2_gas",
                                    "type": {
                                      "kind": "integer",
                                      "sign": "unsigned",
                                      "width": 128
                                    }
                                  }
                                ]
                              }
                            }
                          ]
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "protocol_nullifier",
                  "type": {
                    "kind": "field"
                  }
                },
                {
                  "name": "vk_tree_root",
                  "type": {
                    "kind": "field"
                  }
                },
                {
                  "name": "protocol_contracts",
                  "type": {
                    "kind": "struct",
                    "path": "types::abis::protocol_contracts::ProtocolContracts",
                    "fields": [
                      {
                        "name": "derived_addresses",
                        "type": {
                          "kind": "array",
                          "length": 11,
                          "type": {
                            "kind": "struct",
                            "path": "types::address::aztec_address::AztecAddress",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "field"
                                }
                              }
                            ]
                          }
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "name": "min_revertible_side_effect_counter",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 32
            }
          },
          {
            "name": "validation_requests",
            "type": {
              "kind": "struct",
              "path": "types::abis::validation_requests::private_validation_requests::PrivateValidationRequests",
              "fields": [
                {
                  "name": "note_hash_read_requests",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "nullifier_read_requests",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "scoped_key_validation_requests_and_separators",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::validation_requests::key_validation_request_and_separator::KeyValidationRequestAndSeparator",
                                  "fields": [
                                    {
                                      "name": "request",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::validation_requests::key_validation_request::KeyValidationRequest",
                                        "fields": [
                                          {
                                            "name": "pk_m_hash",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "sk_app",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "key_type_domain_separator",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "name": "end",
            "type": {
              "kind": "struct",
              "path": "types::abis::accumulated_data::private_accumulated_data::PrivateAccumulatedData",
              "fields": [
                {
                  "name": "note_hashes",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "nullifiers",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::nullifier::Nullifier",
                                        "fields": [
                                          {
                                            "name": "value",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "note_hash",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "l2_to_l1_msgs",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 8,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::messaging::l2_to_l1_message::L2ToL1Message",
                                        "fields": [
                                          {
                                            "name": "recipient",
                                            "type": {
                                              "kind": "struct",
                                              "path": "types::address::eth_address::EthAddress",
                                              "fields": [
                                                {
                                                  "name": "inner",
                                                  "type": {
                                                    "kind": "field"
                                                  }
                                                }
                                              ]
                                            }
                                          },
                                          {
                                            "name": "content",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "private_logs",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 64,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::private_log::PrivateLogData",
                                        "fields": [
                                          {
                                            "name": "log",
                                            "type": {
                                              "kind": "struct",
                                              "path": "types::abis::log::Log",
                                              "fields": [
                                                {
                                                  "name": "fields",
                                                  "type": {
                                                    "kind": "array",
                                                    "length": 16,
                                                    "type": {
                                                      "kind": "field"
                                                    }
                                                  }
                                                },
                                                {
                                                  "name": "length",
                                                  "type": {
                                                    "kind": "integer",
                                                    "sign": "unsigned",
                                                    "width": 32
                                                  }
                                                }
                                              ]
                                            }
                                          },
                                          {
                                            "name": "note_hash_counter",
                                            "type": {
                                              "kind": "integer",
                                              "sign": "unsigned",
                                              "width": 32
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "contract_class_logs_hashes",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 1,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::scoped::Scoped",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::side_effect::counted::Counted",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::log_hash::LogHash",
                                        "fields": [
                                          {
                                            "name": "value",
                                            "type": {
                                              "kind": "field"
                                            }
                                          },
                                          {
                                            "name": "length",
                                            "type": {
                                              "kind": "integer",
                                              "sign": "unsigned",
                                              "width": 32
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "counter",
                                      "type": {
                                        "kind": "integer",
                                        "sign": "unsigned",
                                        "width": 32
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "contract_address",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::address::aztec_address::AztecAddress",
                                  "fields": [
                                    {
                                      "name": "inner",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "public_call_requests",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 32,
                          "type": {
                            "kind": "struct",
                            "path": "types::side_effect::counted::Counted",
                            "fields": [
                              {
                                "name": "inner",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::public_call_request::PublicCallRequest",
                                  "fields": [
                                    {
                                      "name": "msg_sender",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "contract_address",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "is_static_call",
                                      "type": {
                                        "kind": "boolean"
                                      }
                                    },
                                    {
                                      "name": "calldata_hash",
                                      "type": {
                                        "kind": "field"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "counter",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "private_call_stack",
                  "type": {
                    "kind": "struct",
                    "path": "types::utils::arrays::claimed_length_array::ClaimedLengthArray",
                    "fields": [
                      {
                        "name": "array",
                        "type": {
                          "kind": "array",
                          "length": 16,
                          "type": {
                            "kind": "struct",
                            "path": "types::abis::private_call_request::PrivateCallRequest",
                            "fields": [
                              {
                                "name": "call_context",
                                "type": {
                                  "kind": "struct",
                                  "path": "types::abis::call_context::CallContext",
                                  "fields": [
                                    {
                                      "name": "msg_sender",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "contract_address",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::address::aztec_address::AztecAddress",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "field"
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "function_selector",
                                      "type": {
                                        "kind": "struct",
                                        "path": "types::abis::function_selector::FunctionSelector",
                                        "fields": [
                                          {
                                            "name": "inner",
                                            "type": {
                                              "kind": "integer",
                                              "sign": "unsigned",
                                              "width": 32
                                            }
                                          }
                                        ]
                                      }
                                    },
                                    {
                                      "name": "is_static_call",
                                      "type": {
                                        "kind": "boolean"
                                      }
                                    }
                                  ]
                                }
                              },
                              {
                                "name": "args_hash",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "returns_hash",
                                "type": {
                                  "kind": "field"
                                }
                              },
                              {
                                "name": "start_side_effect_counter",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              },
                              {
                                "name": "end_side_effect_counter",
                                "type": {
                                  "kind": "integer",
                                  "sign": "unsigned",
                                  "width": 32
                                }
                              }
                            ]
                          }
                        }
                      },
                      {
                        "name": "length",
                        "type": {
                          "kind": "integer",
                          "sign": "unsigned",
                          "width": 32
                        }
                      }
                    ]
                  }
                }
              ]
            }
          },
          {
            "name": "public_teardown_call_request",
            "type": {
              "kind": "struct",
              "path": "types::abis::public_call_request::PublicCallRequest",
              "fields": [
                {
                  "name": "msg_sender",
                  "type": {
                    "kind": "struct",
                    "path": "types::address::aztec_address::AztecAddress",
                    "fields": [
                      {
                        "name": "inner",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "contract_address",
                  "type": {
                    "kind": "struct",
                    "path": "types::address::aztec_address::AztecAddress",
                    "fields": [
                      {
                        "name": "inner",
                        "type": {
                          "kind": "field"
                        }
                      }
                    ]
                  }
                },
                {
                  "name": "is_static_call",
                  "type": {
                    "kind": "boolean"
                  }
                },
                {
                  "name": "calldata_hash",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "fee_payer",
            "type": {
              "kind": "struct",
              "path": "types::address::aztec_address::AztecAddress",
              "fields": [
                {
                  "name": "inner",
                  "type": {
                    "kind": "field"
                  }
                }
              ]
            }
          },
          {
            "name": "expiration_timestamp",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 64
            }
          },
          {
            "name": "is_private_only",
            "type": {
              "kind": "boolean"
            }
          },
          {
            "name": "claimed_revertible_counter",
            "type": {
              "kind": "integer",
              "sign": "unsigned",
              "width": 32
            }
          }
        ]
      },
      "visibility": "public"
    },
    "error_types": {
      "94765493633582853": {
        "error_kind": "string",
        "string": "private_call_requests length out of bounds"
      },
      "117837988875837642": {
        "error_kind": "string",
        "string": "l2_to_l1_msgs length out of bounds"
      },
      "361444214588792908": {
        "error_kind": "string",
        "string": "attempt to multiply with overflow"
      },
      "593440268255346592": {
        "error_kind": "string",
        "string": "key_validation_requests_and_separators length out of bounds"
      },
      "1889185465531656186": {
        "error_kind": "string",
        "string": "Mismatch counter: side effect does not match hint"
      },
      "1998584279744703196": {
        "error_kind": "string",
        "string": "attempt to subtract with overflow"
      },
      "2346805166732865765": {
        "error_kind": "string",
        "string": "claimed_revertible_counter must be greater than the first call's start counter"
      },
      "2965999157539980434": {
        "error_kind": "string",
        "string": "contract address does not match origin"
      },
      "4056541661037948263": {
        "error_kind": "string",
        "string": "First call in a tx cannot be static"
      },
      "4177897422276625301": {
        "error_kind": "string",
        "string": "Mismatch global index: value does not match hint"
      },
      "4450719284691415785": {
        "error_kind": "string",
        "string": "incorrect msg_sender for private call request"
      },
      "6051170412616329527": {
        "error_kind": "string",
        "string": "computed contract address does not match protocol contract derived address"
      },
      "6239565706110373920": {
        "error_kind": "string",
        "string": "Mismatch counter: end of call request does not match hint"
      },
      "6317798328792492338": {
        "error_kind": "string",
        "string": "Counter must be greater than previous counter"
      },
      "6403114577918625889": {
        "error_kind": "string",
        "string": "Mismatch global index: end of call request does not match hint"
      },
      "6441705196486064186": {
        "error_kind": "string",
        "string": "Attempt to pop from an empty vector"
      },
      "6501950505635475641": {
        "error_kind": "string",
        "string": "public_call_requests length out of bounds"
      },
      "7036737383132764408": {
        "error_kind": "string",
        "string": "tx_context in private call does not match the value in tx_request"
      },
      "7218841323701226996": {
        "error_kind": "string",
        "string": "Mismatch counter: value does not match hint"
      },
      "8165923537385367162": {
        "error_kind": "string",
        "string": "computed contract class id does not match updated contract class id"
      },
      "8201347468899693567": {
        "error_kind": "string",
        "string": "Mismatch counter: start of call request does not match hint"
      },
      "8247167135718377098": {
        "error_kind": "string",
        "string": "function_selector in call_context does not match the value in tx_request"
      },
      "8320366403474404434": {
        "error_kind": "string",
        "string": "nullifier_read_requests length out of bounds"
      },
      "8334178102729634909": {
        "error_kind": "string",
        "string": "note_hashes length out of bounds"
      },
      "8414973249286697576": {
        "error_kind": "string",
        "string": "note_hash_read_requests length out of bounds"
      },
      "10218075541036113978": {
        "error_kind": "string",
        "string": "Private call has incorrect counter range"
      },
      "10832362746926332672": {
        "error_kind": "string",
        "string": "Attempting to execute a 'derived' protocol contract address. This is not allowed."
      },
      "11023510496214579275": {
        "error_kind": "string",
        "string": "Users cannot set msg_sender in first call"
      },
      "11217216648848338406": {
        "error_kind": "string",
        "string": "The provided public data tree leaf preimage is not the correct leaf for the requested slot"
      },
      "11697200665944159845": {
        "error_kind": "string",
        "string": "args_hash in private call does not match the value in tx_request"
      },
      "12469291177396340830": {
        "error_kind": "string",
        "string": "call to assert_max_bit_size"
      },
      "12913276134398371456": {
        "error_kind": "string",
        "string": "push out of bounds"
      },
      "12946174891944366839": {
        "error_kind": "string",
        "string": "claimed_revertible_counter must be greater than 2"
      },
      "12953307709153182743": {
        "error_kind": "string",
        "string": "nullifiers length out of bounds"
      },
      "13734038595735573514": {
        "error_kind": "string",
        "string": "delayed_public_mutable must be zeroed when its stored hash is zero"
      },
      "14886123564205298264": {
        "error_kind": "string",
        "string": "private_logs length out of bounds"
      },
      "14990209321349310352": {
        "error_kind": "string",
        "string": "attempt to add with overflow"
      },
      "15006138040785206729": {
        "error_kind": "string",
        "string": "Sorted counter hints must have null trailing values"
      },
      "15098453168151071904": {
        "error_kind": "string",
        "string": "Failed to validate expected revertible side effect counter"
      },
      "15317677453749268000": {
        "error_kind": "string",
        "string": "Mismatch global index: start of call request does not match hint"
      },
      "15711892660910782274": {
        "error_kind": "string",
        "string": "Hint values do not match hash"
      },
      "15801487259733804996": {
        "error_kind": "string",
        "string": "start_side_effect_counter must be greater than 1"
      },
      "15954133960943293689": {
        "error_kind": "string",
        "string": "Failed to validate expected non revertible side effect counter"
      },
      "16216212843441549037": {
        "error_kind": "string",
        "string": "Proving public value inclusion failed"
      },
      "16431471497789672479": {
        "error_kind": "string",
        "string": "Index out of bounds"
      },
      "16438966280147474101": {
        "error_kind": "string",
        "string": "computed contract address does not match expected one"
      },
      "16457368597604677443": {
        "error_kind": "string",
        "string": "claimed_revertible_counter must not be 0 for a tx with public calls"
      },
      "16557807701413196365": {
        "error_kind": "string",
        "string": "tx_request does not indicate the first function is private"
      },
      "16718235391831656706": {
        "error_kind": "string",
        "string": "incorrect msg_sender for public teardown call request"
      },
      "16736033794689240501": {
        "error_kind": "string",
        "string": "contract_class_logs_hashes length out of bounds"
      },
      "17725478081255413659": {
        "error_kind": "string",
        "string": "Mismatch global index: side effect does not match hint"
      },
      "17782979940490805738": {
        "error_kind": "string",
        "string": "incorrect msg_sender for public call request"
      },
      "18220261005428713684": {
        "error_kind": "string",
        "string": "Counter must be less than the end counter of the call"
      },
      "18348998335150574775": {
        "error_kind": "string",
        "string": "protocol_nullifier in private call does not match the tx request"
      }
    }
  },
  "bytecode": "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",
  "debug_symbols": "",
  "file_map": {},
  "aztec_version": "6.0.0"
}
;
